import { ComingSoon } from '../../components/Card'
import { Screen } from '../../components/Screen'

export function RacesScreen() {
  return (
    <Screen
      title="Races"
      description="Find events that match the athlete's level and enter them."
    >
      <ComingSoon
        milestone="M1"
        items={[
          'Event calendar with eligibility',
          'Course profile with distance and elevation',
          'Race entry, strategy and simulation',
        ]}
      />
    </Screen>
  )
}
