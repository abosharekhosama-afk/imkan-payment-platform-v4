import React from 'react';

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="v4-form-section">
      <header className="v4-form-section-head">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </header>
      <div className="v4-form-grid">{children}</div>
    </section>
  );
}
