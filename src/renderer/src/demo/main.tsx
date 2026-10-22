// Browser preview entry: install the localStorage-backed window.api, then boot the normal app
import { installBrowserApi } from './browserApi'

installBrowserApi()
import('../main')
