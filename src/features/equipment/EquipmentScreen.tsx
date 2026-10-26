import { ComingSoon } from '../../components/Card'
import { Screen } from '../../components/Screen'

export function EquipmentScreen() {
  return (
    <Screen
      title="Equipment"
      description="Manage owned gear and buy new equipment with terrain-specific bonuses."
    >
      <ComingSoon
        milestone="M1"
        items={[
          'Inventory of owned shoes, hydration vests and poles',
          'Shop with prices and visible unlock requirements',
          'Equipment stats and terrain bonuses',
        ]}
      />
    </Screen>
  )
}
