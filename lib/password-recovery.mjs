/** @param {string} password @param {string} confirmation */
export function passwordProblem(password, confirmation) {
  if (Array.from(password).length < 8)
    return "パスワードは8文字以上で入力してください。";
  if (password !== confirmation) return "確認用パスワードが一致していません。";
  return null;
}

/** @param {unknown} error */
export function recoveryErrorCode(error) {
  if (!error || typeof error !== "object") return null;
  const code = Reflect.get(error, "code");
  return typeof code === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(code)
    ? code
    : null;
}

/** @param {unknown} error */
export function missingRecoveryAccount(error) {
  return ["user_not_found", "email_not_found"].includes(
    recoveryErrorCode(error) || "",
  );
}

/** Logs operational fields only. Never include email, password, token or full errors.
 * @param {string} stage @param {unknown} error
 */
export function logRecoveryError(stage, error) {
  const status =
    error && typeof error === "object" ? Reflect.get(error, "status") : null;
  console.error(
    "[Relay password recovery]",
    JSON.stringify({
      event: "relay.password_recovery.failed",
      stage,
      code: recoveryErrorCode(error),
      status: typeof status === "number" ? status : null,
    }),
  );
}
