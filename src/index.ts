import { API } from 'homebridge'

import { PLATFORM_NAME } from './settings'
import { HomebridgeProxmoxPlatform } from './platform'

// authorize self signed cert if you do not use a valid SSL certificat
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

/**
 * This method registers the platform with Homebridge
 */
export = (api: API) => {
	api.registerPlatform(PLATFORM_NAME, HomebridgeProxmoxPlatform)
}
