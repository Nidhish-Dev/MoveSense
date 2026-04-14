import { SessionRecord } from '../lib/storage';
import { formatClockTime, formatDuration } from '../lib/time';

type SessionTimelineProps = {
  sessions: SessionRecord[];
};

export function SessionTimeline({ sessions }: SessionTimelineProps) {
  if (sessions.length === 0) {
    return (
      <div className="panel-empty">
        <h3>No sessions yet today</h3>
        <p>Start a focus block and MoveSense will build your daily timeline here.</p>
      </div>
    );
  }

  return (
    <div className="timeline-list">
      {sessions
        .slice()
        .reverse()
        .map((session) => (
          <article className="timeline-item" key={session.id}>
            <div>
              <p className="timeline-item__time">
                {formatClockTime(session.startedAt)} -{' '}
                {session.endedAt ? formatClockTime(session.endedAt) : 'Live'}
              </p>
              <h3>Focus session</h3>
            </div>
            <div className="timeline-item__meta">
              <span>{formatDuration(session.durationSeconds)}</span>
              <span>{session.breakCount} breaks</span>
              <span>{session.idleEvents} idle alerts</span>
            </div>
          </article>
        ))}
    </div>
  );
}
