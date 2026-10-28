import { ComingSoon } from '../../components/Card'
import { Screen } from '../../components/Screen'

export function CareerScreen() {
  return (
    <Screen
      title="Career"
      description="Track results, ranking and season progression."
    >
      <ComingSoon
        milestone="a later milestone"
        items={[
          'Race results and rewards history',
          'Season ranking against simulated rivals',
          'Progression and achievements',
        ]}
      />
    </Screen>
  )
}
