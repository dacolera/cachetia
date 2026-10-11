import { computeState } from '../domain/rules';
import type { Match } from '../domain/types';
import { useStore } from '../store';

/** Placar rodada a rodada: uma linha por rodada, com a pontuação de cada um depois dela. */
export function RoundsTable({ match }: { match: Match }) {
  const store = useStore();
  const final = computeState(match);
  const playerIds = final.standings.map((s) => s.playerId);

  // Uma linha por rodada, com a pontuação de cada um depois dela.
  const rows: { label: string; dealerId?: string; handId?: string; winnerId?: string; fled: Set<string>; points: Map<string, number> }[] = [];
  // A linha "Início" para antes da primeira rodada (inclusive do início em duas etapas, que já desconta quem correu).
  const firstRound = match.events.findIndex((e) => e.type === 'round' || e.type === 'start');
  const cuts = [firstRound === -1 ? match.events.length : firstRound];
  match.events.forEach((e, i) => e.type === 'round' && cuts.push(i + 1));
  for (const cut of cuts) {
    const ev = match.events[cut - 1];
    const st = computeState({ events: match.events.slice(0, cut), firstDealerId: match.firstDealerId });
    const isRound = ev?.type === 'round';
    rows.push({
      label: st.roundsPlayed === 0 ? 'Início' : `Rodada ${st.roundsPlayed}`,
      dealerId: isRound ? st.dealers[st.dealers.length - 1] : undefined,
      handId: isRound ? st.hands[st.hands.length - 1] : undefined,
      winnerId: isRound ? ev.winnerId : undefined,
      fled: new Set(isRound ? ev.fled : []),
      points: new Map(st.standings.map((s) => [s.playerId, s.points])),
    });
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th />
            {playerIds.map((pid) => (
              <th key={pid}>{store.playerName(pid)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const prev = rows[i - 1];
            return (
              <tr key={i}>
                <th>
                  {r.label}
                  {r.dealerId && (
                    <small className="dealt">
                      ♠ {store.playerName(r.dealerId)}
                      {r.handId && `, mão ${store.playerName(r.handId)}`}
                    </small>
                  )}
                </th>
                {playerIds.map((pid) => {
                  const pts = r.points.get(pid);
                  if (pts === undefined) return <td key={pid} className="na" />;
                  const wasOut = prev?.points.get(pid) === 0;
                  if (wasOut) return <td key={pid} className="na" />;
                  const joined = prev && !prev.points.has(pid);
                  const mark = r.winnerId === pid ? 'win' : r.fled.has(pid) ? 'fled' : '';
                  return (
                    <td key={pid} className={[mark, pts === 0 && 'zero'].filter(Boolean).join(' ')}>
                      {pts}
                      {mark === 'win' && ' ★'}
                      {mark === 'fled' && <small> correu</small>}
                      {joined && <small> entrou</small>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
