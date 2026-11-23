import { Component, type ReactNode } from "react";
import { ErrorBox } from "./ui";

/** Keeps the rest of the app usable if one page fails to render. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) return <ErrorBox message={`This section failed to display (${this.state.error.message}). Other sections still work; reloading usually helps.`} onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}
