type SuggestionBoardProps = {
  activeSuggestion: string;
};

const suggestions = [
  {
    title: 'Stretch reset',
    description: 'Roll your shoulders, loosen your neck, and do a 30-second arm stretch.',
    key: 'stretching'
  },
  {
    title: 'Short walk',
    description: 'Take a 2 to 5 minute walk to reset focus and improve circulation.',
    key: 'walking'
  },
  {
    title: 'Stand tall',
    description: 'Stand up for one minute, breathe deeply, and let your posture reset.',
    key: 'standing'
  }
];

export function SuggestionBoard({ activeSuggestion }: SuggestionBoardProps) {
  return (
    <div className="suggestion-grid">
      {suggestions.map((suggestion) => (
        <article
          className={`suggestion-card ${
            activeSuggestion === suggestion.key ? 'suggestion-card--active' : ''
          }`}
          key={suggestion.key}
        >
          <div className="suggestion-card__pill">Movement</div>
          <h3>{suggestion.title}</h3>
          <p>{suggestion.description}</p>
        </article>
      ))}
    </div>
  );
}
