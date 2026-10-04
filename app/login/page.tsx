import AuthForm from "@/components/auth-form";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  return <AuthForm {...await searchParams} />;
}
