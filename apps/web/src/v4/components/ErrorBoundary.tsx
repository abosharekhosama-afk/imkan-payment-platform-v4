import React from 'react';
import {Alert, Button} from '../design-system/components';

type Props = {children: React.ReactNode};
type State = {error: Error | null};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {error: null};

  static getDerivedStateFromError(error: Error) {
    return {error};
  }

  render() {
    if (this.state.error) {
      return (
        <div className="v4-content">
          <Alert tone="danger">
            Unexpected UI error: {this.state.error.message}
          </Alert>
          <Button type="button" onClick={() => this.setState({error: null})}>
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
