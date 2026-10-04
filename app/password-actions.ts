"use server";
import { redirect } from "next/navigation";
import { configured, supabase } from "@/lib/supabase";
import {
  logRecoveryError,
  missingRecoveryAccount,
  passwordProblem,
  recoveryErrorCode,
} from "@/lib/password-recovery.mjs";

const resetFailure = (message: string): never =>
  redirect("/reset-password?error=" + encodeURIComponent(message));
export async function requestPasswordReset(form: FormData) {
  if (!configured()) redirect("/setup");
  const email = String(form.get("email") || "").trim();
  if (
    !email ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    redirect(
      "/forgot-password?error=" +
        encodeURIComponent("メールアドレスを確認してください。"),
    );
  }
  let failure: unknown;
  try {
    const db = await supabase();
    // Supabase's trusted Site URL + the Reset Password email template define the
    // destination. Do not trust Origin/Host headers to construct recovery links.
    const { error } = await db.auth.resetPasswordForEmail(email);
    failure = error;
  } catch (error) {
    failure = error;
  }
  if (failure && !missingRecoveryAccount(failure)) {
    logRecoveryError("request_email", failure);
    redirect(
      "/forgot-password?error=" +
        encodeURIComponent(
          "メールを送信できませんでした。時間をおいて再度お試しください。",
        ),
    );
  }
  // Identical response for existing and unknown addresses; no account enumeration.
  redirect("/forgot-password?sent=1");
}

export async function updatePassword(form: FormData) {
  if (!configured()) redirect("/setup");
  const password = String(form.get("password") || "");
  const confirmation = String(form.get("confirmation") || "");
  const problem = passwordProblem(password, confirmation);
  if (problem) resetFailure(problem);
  let stage = "verify_session";
  let failure: unknown;
  try {
    const db = await supabase();
    const {
      data: { user },
      error: sessionError,
    } = await db.auth.getUser();
    if (sessionError || !user) {
      failure = sessionError || new Error("Missing recovery session");
    } else {
      stage = "update_password";
      const { error } = await db.auth.updateUser({ password });
      failure = error;
      if (!error) {
        // Invalidate refresh sessions and clear the recovery session before login.
        stage = "sign_out";
        try {
          const { error: logoutError } = await db.auth.signOut({
            scope: "global",
          });
          if (logoutError) {
            logRecoveryError(stage, logoutError);
            const { error: localError } = await db.auth.signOut({
              scope: "local",
            });
            if (localError) logRecoveryError("local_sign_out", localError);
          }
        } catch (logoutError) {
          // Password was already saved: do not report a failed update or retry it.
          logRecoveryError(stage, logoutError);
        }
      }
    }
  } catch (error) {
    failure = error;
  }
  if (failure) {
    logRecoveryError(stage, failure);
    const code = recoveryErrorCode(failure);
    resetFailure(
      stage === "verify_session" ||
        [
          "session_not_found",
          "session_expired",
          "reauthentication_needed",
        ].includes(code || "")
        ? "再設定リンクが無効または期限切れです。メールを再送してください。"
        : code === "same_password"
          ? "現在と異なるパスワードを入力してください。"
          : code === "weak_password"
            ? "パスワードが安全性の条件を満たしていません。別のパスワードをお試しください。"
            : "パスワードを保存できませんでした。時間をおいて再度お試しください。",
    );
  }
  redirect(
    "/login?message=" +
      encodeURIComponent(
        "パスワードを更新しました。新しいパスワードでログインしてください。",
      ),
  );
}
