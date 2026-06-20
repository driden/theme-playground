import React from "react";
import { errMessage } from "@playground/lib/err";

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  override render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong.</h2>
          <pre>{errMessage(this.state.error)}</pre>
          <button type="button" onClick={this.handleReload}>
            reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
