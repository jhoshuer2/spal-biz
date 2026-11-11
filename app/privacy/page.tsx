import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { CONTACT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy · SPAL Biz" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy">
      <p>Spal helps you run your shop. To do that, it keeps what you tell it. This page says what we keep, why, who helps us handle it, and how to take it back.</p>

      <h2>What we keep</h2>
      <ul>
        <li>Your name, your shop's name and what you sell.</li>
        <li>What you tell Spal: sales, spending, who owes you, and what you say or type when you correct something.</li>
        <li>Your voice recordings, when you talk to Spal. We keep the recording so Spal can read it again if it got something wrong.</li>
        <li>Names and phone numbers of your customers, only if you tell Spal or type them in.</li>
        <li>Your photo, if you add one. Your email and password, if you save your account.</li>
        <li>Basic phone details (the type of phone and browser) so reminders and fixes work.</li>
      </ul>

      <h2>Why we keep it</h2>
      <p>To show you your sales, debts and customers, to remind you, and to make Spal better at understanding you. We do not sell your information. We do not show your business to other shops. We do not message your customers: Spal only writes a message for you, and you send it yourself from your own WhatsApp.</p>

      <h2>Who helps us</h2>
      <p>Some companies handle your information for us, only to run Spal:</p>
      <ul>
        <li><strong>Supabase</strong> stores your records and your account.</li>
        <li><strong>Vercel</strong> runs the app.</li>
        <li><strong>Anthropic</strong> reads the words of your notes so Spal can understand them.</li>
        <li><strong>ElevenLabs</strong> turns your voice into words.</li>
        <li><strong>Cloudflare</strong> checks that a real person is signing in.</li>
        <li><strong>Resend</strong> sends the email when you save your account or sign in.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li><strong>Take your records with you.</strong> In your profile, choose "Your data" and download everything.</li>
        <li><strong>Delete everything.</strong> In your profile, choose "Your data", then "Delete my account". Your records, recordings, photo and account are removed.</li>
        <li><strong>Fix a mistake.</strong> Tap any entry to change or remove it, or tell Spal what to change.</li>
        <li><strong>Reminders.</strong> You can turn them off in your profile at any time.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>For as long as you have an account. If you delete your account, we delete your information straight away. Copies held in backups are removed when those backups expire.</p>

      <h2>Keeping it safe</h2>
      <p>Your information is stored in a protected database where each shop can only see its own records. Nobody can read your sales by browsing the app. We take care, but no system is perfectly safe, so please keep your phone and password private.</p>

      <h2>Children</h2>
      <p>Spal is for people running a business. It is not meant for anyone under 18.</p>

      <h2>Questions</h2>
      <p>Write to us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. If we change this page in a way that matters to you, we will tell you in the app first.</p>
    </LegalPage>
  );
}
