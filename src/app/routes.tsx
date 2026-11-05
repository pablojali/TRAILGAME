import type { RouteObject } from 'react-router'
import { AppearanceScreen } from '../features/appearance/AppearanceScreen'
import { AttributesScreen } from '../features/attributes/AttributesScreen'
import { CareerScreen } from '../features/career/CareerScreen'
import { DashboardScreen } from '../features/dashboard/DashboardScreen'
import { EquipmentScreen } from '../features/equipment/EquipmentScreen'
import { NotFoundScreen } from '../features/not-found/NotFoundScreen'
import { RaceDetailScreen } from '../features/races/RaceDetailScreen'
import { RaceRunScreen } from '../features/races/RaceRunScreen'
import { RaceResultScreen } from '../features/races/RaceResultScreen'
import { RacesScreen } from '../features/races/RacesScreen'
import { SettingsScreen } from '../features/settings/SettingsScreen'
import { TrainingScreen } from '../features/training/TrainingScreen'
import { AppShell } from './AppShell'
import { GameProvider } from './game/GameProvider'
import { I18nProvider } from '../i18n/i18n'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: (
      <I18nProvider>
        <GameProvider>
          <AppShell />
        </GameProvider>
      </I18nProvider>
    ),
    children: [
      { index: true, element: <DashboardScreen /> },
      { path: 'training', element: <TrainingScreen /> },
      { path: 'equipment', element: <EquipmentScreen /> },
      { path: 'appearance', element: <AppearanceScreen /> },
      { path: 'races', element: <RacesScreen /> },
      { path: 'races/:raceId', element: <RaceDetailScreen /> },
      { path: 'races/results/:entryId', element: <RaceResultScreen /> },
      { path: 'races/run/:entryId', element: <RaceRunScreen /> },
      { path: 'career', element: <CareerScreen /> },
      { path: 'attributes', element: <AttributesScreen /> },
      { path: 'settings', element: <SettingsScreen /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
]
