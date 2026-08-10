import React from 'react';
import {Link} from 'react-router-dom';
import {PageHeader} from '../design-system/components';

export function ForbiddenPage() {
  return (
    <div>
      <PageHeader
        title="Access denied"
        description="Your role does not include permission for this screen. Contact an organization owner if you need access."
        crumbs={[{label: 'Security'}]}
      />
      <p>
        <Link to="/">Return to dashboard</Link>
      </p>
    </div>
  );
}
