import { ComingSoon } from '../../components/Card'
import { Screen } from '../../components/Screen'

export function TrainingScreen() {
  return (
    <Screen
      title="Training"
      description="Plan the athlete's week and balance fitness gains against fatigue and recovery."
    >
      <ComingSoon
        milestone="M1"
        items={[
          'Seven-day training calendar',
          'Session selection: easy run, intervals, hills, long run, strength, technique and rest',
          'Training feedback on fitness, fatigue and XP',
        ]}
      />
    </Screen>
  )
}
