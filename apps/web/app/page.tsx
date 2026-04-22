const stack = [
  "Next.js on Vercel",
  "NestJS API on Railway",
  "Worker service for background jobs",
  "Supabase Postgres + Auth",
  "Amazon S3 for file storage",
  "Redis + BullMQ for queues",
  "OpenAI primary AI provider",
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">AIJobs</p>
        <h1>Precision-first AI job platform scaffold</h1>
        <p className="lede">
          The monorepo is ready for the web app, API, worker pipeline, and shared packages we
          outlined in the product architecture.
        </p>
      </section>

      <section className="panel">
        <h2>Initial stack</h2>
        <ul className="stack-list">
          {stack.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}

