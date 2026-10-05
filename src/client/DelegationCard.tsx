import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';

export function DelegationCard({
  target,
  instructions,
  result,
}: {
  target: string;
  instructions: string;
  result?: unknown;
}) {
  const complete = result !== undefined;
  return (
    <section className="delegation-card" aria-label={`Delegación a ${target}`}>
      <header>
        {complete ? (
          <CheckCircle2 size={16} />
        ) : (
          <Loader2 size={16} className="spin" />
        )}
        <strong>
          {complete ? `Tarea completada por ${target}` : `Delegando a ${target}…`}
        </strong>
      </header>
      {instructions && <p className="delegation-instructions">{instructions}</p>}
      <div className="delegation-flow">
        <span className="delegation-node">Hermes</span>
        <ArrowRight size={14} />
        <span className="delegation-node target">{target}</span>
        {complete && (
          <>
            <ArrowRight size={14} />
            <span className="delegation-node done">Resultado</span>
          </>
        )}
      </div>
    </section>
  );
}
