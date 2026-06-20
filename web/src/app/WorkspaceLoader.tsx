const BOOT_LINES = [
  "Preparing workspace shell",
  "Syncing profiles and route state",
  "Restoring automations and Task Flow",
];

export function WorkspaceLoader() {
  return (
    <div className="workspace-loader" role="status">
      <div aria-hidden="true" className="workspace-loader__bg">
        <div className="workspace-loader__grid" />
        <div className="workspace-loader__glow workspace-loader__glow--primary" />
        <div className="workspace-loader__glow workspace-loader__glow--secondary" />
        <div className="workspace-loader__ring workspace-loader__ring--outer" />
        <div className="workspace-loader__ring workspace-loader__ring--inner" />
      </div>
      <div className="workspace-loader__center">
        <div className="workspace-loader__status-row">
          <span className="workspace-loader__status-chip">
            <span className="workspace-loader__status-dot" />
            self-hosted workspace
          </span>
          <span className="workspace-loader__status-copy">dist runtime online</span>
        </div>
        <div className="workspace-loader__terminal">
          <div className="workspace-loader__terminal-head">
            <span className="workspace-loader__dot workspace-loader__dot--red" />
            <span className="workspace-loader__dot workspace-loader__dot--yellow" />
            <span className="workspace-loader__dot workspace-loader__dot--green" />
            <span className="workspace-loader__terminal-title">workspace boot</span>
          </div>
          <div className="workspace-loader__terminal-body">
            <span className="workspace-loader__prompt">$</span>
            <span className="workspace-loader__brand" translate="no">
              <span className="workspace-loader__brand-bracket">[</span>
              AFKBOT
              <span className="workspace-loader__brand-bracket">]</span>
            </span>
            <span className="workspace-loader__cursor" />
          </div>
          <div className="workspace-loader__meter">
            <div className="workspace-loader__meter-head">
              <span>runtime sync</span>
              <span>58%</span>
            </div>
            <div className="workspace-loader__meter-track">
              <span className="workspace-loader__meter-bar" />
            </div>
          </div>
          <div className="workspace-loader__boot-lines">
            {BOOT_LINES.map((line) => (
              <div className="workspace-loader__boot-line" key={line}>
                <span className="workspace-loader__boot-dot" />
                <span className="workspace-loader__boot-text">{line}</span>
                <span className="workspace-loader__boot-spinner" />
              </div>
            ))}
          </div>
        </div>
        <p className="workspace-loader__tagline">Bringing the workspace online.</p>
      </div>
    </div>
  );
}
