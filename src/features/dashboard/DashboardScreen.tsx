import { Card, ComingSoon, StatTile } from '../../components/Card'
import grid from '../../components/Grid.module.css'
import { Screen } from '../../components/Screen'
import styles from './DashboardScreen.module.css'

export function DashboardScreen() {
  return (
    <Screen
      eyebrow="Season 1 · Preview"
      title="Dashboard"
      description="Your athlete overview, weekly status, next race and key action will appear here."
    >
      <div className={styles.hero} aria-hidden="true">
        <svg viewBox="0 0 400 120" preserveAspectRatio="none" className={styles.ridge}>
          <path
            d="M0 120 L0 88 L48 60 L86 78 L140 30 L186 66 L228 44 L270 70 L318 18 L360 56 L400 40 L400 120 Z"
            className={styles.ridgeBack}
          />
          <path
            d="M0 120 L0 100 L60 82 L110 96 L170 70 L230 92 L290 74 L350 94 L400 80 L400 120 Z"
            className={styles.ridgeFront}
          />
          <path
            d="M20 112 C80 96 120 108 180 92 S300 86 380 70"
            className={styles.trail}
          />
        </svg>
      </div>

      <div className={grid.stats}>
        <StatTile label="Fitness" value="—" tone="brand" />
        <StatTile label="Fatigue" value="—" tone="accent" />
        <StatTile label="Money" value="—" tone="ochre" />
        <StatTile label="XP" value="—" tone="brand" />
      </div>

      <div className={grid.cards}>
        <Card title="Next race">
          <p className={styles.muted}>No race entered yet.</p>
        </Card>
        <ComingSoon
          milestone="M1"
          items={[
            'Demo athlete with archetype and attributes',
            'Weekly status and key action',
            'Upcoming race summary',
          ]}
        />
      </div>
    </Screen>
  )
}
