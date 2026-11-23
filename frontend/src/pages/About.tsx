import { BookOpen, Image, Scale } from "lucide-react";
import { PageHeader } from "../components/Shell";
import { Panel } from "../components/ui";
import { EvidenceMark } from "../brand/EvidenceMark";

export default function About() {
  return (
    <div>
      <PageHeader eyebrow="About" title="TEKMĒ — Evidence over instinct.">
        <span className="font-brand">tekmērion</span> (τεκμήριον) is the Greek word for decisive evidence. TEKMĒ (formerly SCAMPRINT) is an offline, explainable scam-message detector built for Tinyverse Problem Statement 01 by Divya Ramji (USN 1MS24CI044).
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="How it works" icon={<BookOpen className="h-5 w-5" />}>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink">
            <li>Preprocessing undoes disguises (look-alike letters, digit swaps, spaced letters, invisible characters) and adds English glosses for Hinglish words.</li>
            <li>Rule engines find manipulation tactics, link and payment signals, and genuine-message patterns.</li>
            <li>A word + character TF-IDF logistic regression scores the language; a specialist scores transactional messages.</li>
            <li>A calibrated fusion model combines everything into one probability; a category model names the scam type.</li>
            <li>Explanations are assembled from templates and the model's exact contributions — no language model.</li>
          </ol>
          <p className="mt-3 text-sm text-ink-2">The model was trained in Python (scikit-learn) and exported to run in the browser; a parity test checks both give the same answers.</p>
        </Panel>
        <Panel title="Brand" icon={<Scale className="h-5 w-5" />}>
          <div className="flex items-center gap-5">
            <EvidenceMark size={72} variant="dark" title="Evidence Mark, dark variant" />
            <EvidenceMark size={72} variant="light" title="Evidence Mark, light variant" />
            <EvidenceMark size={32} />
            <EvidenceMark size={16} />
          </div>
          <p className="mt-3 text-sm text-ink-2">The Evidence Mark — two architectural bars joined by an axis, with a point of evidence at the centre — is an original SVG. Typefaces: Cinzel, Cormorant Garamond and Inter (SIL Open Font License), bundled locally.</p>
        </Panel>
        <Panel title="Artwork" icon={<Image className="h-5 w-5" />}>
          <p className="text-sm text-ink-2">The Athena guardian illustrations were generated specifically for TEKMĒ by the developer using OpenAI's image generation tool. They are not stock photography; no third-party licence is claimed. Optimised copies are bundled with the app.</p>
        </Panel>
        <Panel title="Data credits" icon={<BookOpen className="h-5 w-5" />}>
          <p className="text-sm text-ink-2">UCI SMS Spam Collection (Almeida &amp; Gómez Hidalgo); Scam Shield SMS (rasheq) including IMC 2025 smishing reports (Agarwal, Papasavva, Suarez-Tangil, Vasek) and the Mishra &amp; Soni SMS Phishing Dataset; Indian Scam SMS synthetic-audited (Ridham115). All CC BY 4.0. External Test B (Scam Shield) is used only for evaluation.</p>
        </Panel>
      </div>
    </div>
  );
}
