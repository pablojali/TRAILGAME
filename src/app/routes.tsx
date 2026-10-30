import type { RouteObject } from 'react-router'
import { AppearanceScreen } from '../features/appearance/AppearanceScreen'
import { AttributesScreen } from '../features/attributes/AttributesScreen'
import { CareerScreen } from '../features/career/CareerScreen'
import { DashboardScreen } from '../features/dashboard/DashboardScreen'
import { EquipmentScreen } from '../features/equipment/EquipmentScreen'
import { NotFoundScreen } from '../features/not-found/NotFoundScreen'
import { RaceDetailScreen } from '../features/races/RaceDetailScreen'
import { RaceResultScreen } from '../features/races/RaceResultScreen'
import { RacesScreen } from '../features/races/RacesScreen'
import { TrainingScreen } from '../features/training/TrainingScreen'
import { AppShell } from './AppShell'
import { GameProvider } from './game/GameProvider'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: (
      <GameProvider>
        <AppShell />
      </GameProvider>
    ),
    children: [
      { index: true, element: <DashboardScreen /> },
      { path: 'training', element: <TrainingScreen /> },
      { path: 'equipment', element: <EquipmentScreen /> },
      { path: 'appearance', element: <AppearanceScreen /> },
      { path: 'races', element: <RacesScreen /> },
      { path: 'races/:raceId', element: <RaceDetailScreen /> },
      { path: 'races/results/:entryId', element: <RaceResultScreen /> },
      { path: 'career', element: <CareerScreen /> },
      { path: 'attributes', element: <AttributesScreen /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
]
