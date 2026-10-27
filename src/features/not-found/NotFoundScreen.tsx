import { Link } from 'react-router'
import { Screen } from '../../components/Screen'
import styles from './NotFoundScreen.module.css'

export function NotFoundScreen() {
  return (
    <Screen title="Off trail" description="This page does not exist.">
      <Link to="/" className={styles.link}>
        Back to Dashboard
      </Link>
    </Screen>
  )
}
