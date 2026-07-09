import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import QuickCapture from "@/components/quick-capture";
import Nav from "@/components/nav";
import SessionRefresh from "@/components/session-refresh";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <>
      <SessionRefresh />
      <Nav userEmail={user.email} />
      {children}
      <QuickCapture />
    </>
  );
}
