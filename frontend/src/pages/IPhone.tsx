import { Apple, CircleCheck, Code2, Download, Laptop, Smartphone, TriangleAlert } from "lucide-react";
import { PageHeader } from "../components/Shell";
import { Note, Panel, StatusChip, type BuildStatus } from "../components/ui";

const STATUS: { item: string; status: BuildStatus; detail: string }[] = [
  { item: "Web app / PWA (manual paste)", status: "available", detail: "Same on-device engine as the desktop UI; installable from Safari; works offline after the first load. Tested in desktop browsers (see TESTING.md); test on your iPhone with the steps below." },
  { item: "Native iOS source (ios/)", status: "in_development", detail: "SwiftUI host app + IdentityLookup Message Filter extension + Swift port of the compact classifier. Written on Windows; never compiled." },
  { item: "Native extension build", status: "not_verified", detail: "Requires macOS and Xcode. No build has been run." },
  { item: "Device installation", status: "not_verified", detail: "Requires signing (free Apple ID Personal Team or paid membership). Not attempted." },
  { item: "Automatic SMS filtering", status: "not_active", detail: "Nothing filters your messages today." },
];

export default function IPhone() {
  return (
    <div>
      <PageHeader eyebrow="iOS integration" title="TEKMĒ on iPhone — honest status">
        What works now, what Apple allows, and what still needs a Mac. Nothing on this page claims that native filtering works.
      </PageHeader>
      <Panel title="Current status" icon={<Smartphone className="h-5 w-5" />}>
        <ul className="divide-y divide-line">
          {STATUS.map((s) => (
            <li key={s.item} className="grid gap-2 py-3 md:grid-cols-[260px_170px_1fr] md:items-center">
              <b className="text-ink">{s.item}</b><span><StatusChip status={s.status} /></span><span className="text-sm text-ink-2">{s.detail}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Use it today (web app)" icon={<Download className="h-5 w-5" />}>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink">
            <li>Open TEKMĒ in Safari over <b>HTTPS</b> (service workers need a secure origin; a plain-http laptop address such as <code>192.168.x.x:8000</code> will not work offline).</li>
            <li>Tap Share → <b>Add to Home Screen</b>.</li>
            <li>Open it once while online so the model (≈3.5 MB compressed) is cached.</li>
            <li>Copy a suspicious SMS, open TEKMĒ, paste and analyse — in flight mode if you like.</li>
          </ol>
          <div className="mt-3"><Note tone="warn">A web app <b>cannot read incoming SMS</b> or filter Messages. You always paste messages yourself.</Note></div>
        </Panel>
        <Panel title="What Apple allows" icon={<Apple className="h-5 w-5" />}>
          <ul className="space-y-1.5 text-sm text-ink">
            <li className="flex gap-2"><CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-safe" aria-hidden />A <b>Message Filter extension</b> (IdentityLookup) can classify <b>SMS/MMS from unknown senders</b> — not iMessage, and not messages from contacts.</li>
            <li className="flex gap-2"><CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-safe" aria-hidden />It returns one action: allow, junk, promotion or transaction (iOS 16+ adds sub-categories). Messages then appear in the matching folder.</li>
            <li className="flex gap-2"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />It cannot add labels to message bubbles, read your inbox, or see messages after the fact.</li>
            <li className="flex gap-2"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />Only one filter app can be enabled (Settings → Apps → Messages → Unknown &amp; Spam).</li>
            <li className="flex gap-2"><CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-safe" aria-hidden />TEKMĒ's extension never uses Apple's optional network deferral — classification stays on the phone.</li>
          </ul>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Native architecture" icon={<Code2 className="h-5 w-5" />}>
          <pre className="overflow-x-auto rounded-xl border border-line bg-bg-2 p-4 text-[0.78rem] leading-relaxed text-ink scroll-thin">{`ios/
├─ TEKMEApp/            SwiftUI host app: status, how-to-enable,
│                        manual paste-and-check using the same classifier
├─ TEKMEFilter/         MessageFilterExtension.swift
│                        (ILMessageFilterQueryHandling, no network)
├─ Shared/              TekmeClassifier.swift — normaliser, entity masks,
│                        compact TF-IDF + logistic model, OTP/benign guards
│  └─ tekme_compact.json  exported + validated in Python (ml/export/ios_model.py)
└─ Tests/               fixtures with expected Python outputs`}</pre>
          <p className="mt-2 text-xs text-ink-3">The compact model is a smaller, separately trained classifier designed to fit extension memory limits. Its accuracy is measured in Python and reported in docs/IOS_GUIDE.md; it is not the full TEKMĒ model.</p>
        </Panel>
        <Panel title="What can be done on Windows" icon={<Laptop className="h-5 w-5" />}>
          <ul className="space-y-1.5 text-sm text-ink">
            <li>✔ Write and review Swift source, export and validate the compact model, generate test fixtures (done).</li>
            <li>✘ Compile Swift for iOS, run the simulator, sign or install — these need macOS + Xcode.</li>
            <li>• Hosted macOS CI (e.g. a cloud Mac runner) can compile and run unit tests, but signing a build for your phone still needs your Apple ID in Xcode. Nothing has been set up or paid for.</li>
            <li>• A free Apple ID (Personal Team) signs apps for 7 days at a time. Apple does not document whether every extension type is allowed for Personal Teams; this must be tried on a Mac.</li>
          </ul>
          <p className="mt-3 text-sm text-ink-2">Reference: Apple Developer documentation → IdentityLookup → “Creating a message filter app extension” (developer.apple.com). TEKMĒ does not link out or load anything from it.</p>
        </Panel>
      </div>
    </div>
  );
}
