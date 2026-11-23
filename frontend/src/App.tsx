import { lazy, Suspense } from "react";
import { AppProvider, useRoute } from "./app/context";
import { Footer, Sidebar, TopNav } from "./components/Shell";
import { MarkLoader } from "./brand/EvidenceMark";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Home from "./pages/Home";

const AnalyzerPage = lazy(() => import("./pages/Analyzer"));
const Conversation = lazy(() => import("./pages/Conversation"));
const Forensics = lazy(() => import("./pages/Forensics"));
const Lab = lazy(() => import("./pages/Lab"));
const ModelIntel = lazy(() => import("./pages/ModelIntel"));
const Batch = lazy(() => import("./pages/Batch"));
const Library = lazy(() => import("./pages/Library"));
const Privacy = lazy(() => import("./pages/Privacy"));
const IPhone = lazy(() => import("./pages/IPhone"));
const Settings = lazy(() => import("./pages/Settings"));
const About = lazy(() => import("./pages/About"));

function Routed() {
  const { route, params } = useRoute();
  const key = route + "?" + params.toString();
  const page = {
    "": null, analyze: <AnalyzerPage key={key} params={params} />, conversation: <Conversation />, forensics: <Forensics key={key} params={params} />,
    lab: <Lab key={key} params={params} />, model: <ModelIntel />, batch: <Batch />, library: <Library />, privacy: <Privacy />,
    iphone: <IPhone />, settings: <Settings />, about: <About />,
  }[route];
  return (
    <div className="min-h-screen">
      <TopNav route={route} />
      {route === "" ? <ErrorBoundary><Home /></ErrorBoundary> : (
        <div className="mx-auto flex max-w-[1536px] items-start gap-5 px-4 py-8 sm:px-6 lg:px-12">
          <Sidebar route={route} />
          <main id="main" tabIndex={-1} className="min-w-0 flex-1">
            <ErrorBoundary key={key}><Suspense fallback={<MarkLoader label="Loading…" />}>{page}</Suspense></ErrorBoundary>
          </main>
        </div>
      )}
      <Footer />
    </div>
  );
}

export default function App() {
  return <AppProvider><Routed /></AppProvider>;
}
