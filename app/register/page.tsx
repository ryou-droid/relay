import AuthForm from "@/components/auth-form";
export default async function Register({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return <AuthForm signup {...await searchParams} />;
}
