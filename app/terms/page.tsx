import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { CONTACT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms · SPAL Biz" };

export default function Terms() {
  return (
    <LegalPage title="Terms">
      <p>These are the simple rules for using Spal. By using Spal you agree to them.</p>

      <h2>What Spal is</h2>
      <p>Spal is an assistant that helps you keep track of your shop: sales, spending, debts and customers. It learns from what you tell it. It is a helper, not an accountant, a bank or a lawyer, and it does not give financial, tax or legal advice.</p>

      <h2>Check the numbers</h2>
      <p>Spal can make mistakes, especially when it mishears you or you speak quickly. It shows you what it understood each time, and you can fix anything. Please check the numbers before you rely on them for money decisions, taxes or loans.</p>

      <h2>Your records are yours</h2>
      <p>What you tell Spal belongs to you. You give us permission to store it and use it only to run Spal for you, as explained in our <a href="/privacy">Privacy page</a>.</p>

      <h2>Messages to your customers</h2>
      <p>Spal can write a message for you, such as a reminder about money owed. It never sends anything by itself: you read it, change it if you like, and send it from your own WhatsApp. You are responsible for what you send.</p>

      <h2>Using Spal properly</h2>
      <ul>
        <li>Give true information about yourself and keep your sign-in private.</li>
        <li>Do not use Spal to cheat or harm other people, or to break the law.</li>
        <li>Do not try to break into Spal, overload it, or take other people's records.</li>
        <li>There are daily limits on how many notes and recordings one account can make. They keep Spal fair and affordable for everyone.</li>
      </ul>

      <h2>Spal may change</h2>
      <p>We are still building Spal. Features will change, and Spal may be unavailable sometimes. We will try to give notice before big changes, and you can always download your records first.</p>

      <h2>Our responsibility</h2>
      <p>We work hard to keep Spal useful and your records safe, but we cannot promise it will always be free of mistakes or always available. To the extent the law allows, we are not responsible for losses that come from relying on Spal's numbers or from times it is not available.</p>

      <h2>Ending your account</h2>
      <p>You can delete your account at any time in your profile. We may close an account that breaks these rules.</p>

      <h2>The law</h2>
      <p>These terms follow the laws of Nigeria.</p>

      <h2>Questions</h2>
      <p>Write to us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </LegalPage>
  );
}
