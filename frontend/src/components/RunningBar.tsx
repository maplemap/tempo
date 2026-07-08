import { useTimer } from '../lib/TimerContext';
import { fmtClock } from '../lib/time';
import { renderDescription } from '../lib/renderDescription';

export default function RunningBar() {
  const { current, elapsedSec, stop } = useTimer();

  if (!current) return null;

  return (
    <div className="running-bar">
      <span className="running-bar-clock">{fmtClock(elapsedSec)}</span>
      <span className="running-bar-desc">
        {current.project_name && <span className="running-bar-proj">{current.project_name} · </span>}
        {renderDescription(current.description, { githubRepo: current.github_repo })}
      </span>
      <button className="btn icon-btn" onClick={() => void stop()}>[ STOP ]</button>
    </div>
  );
}
