import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge'

import { PLATFORM_NAME, PLUGIN_NAME } from './settings'
import { ProxmoxPlatformAccessory } from './platformAccessory'

import proxmoxApi, { Proxmox } from 'proxmox-api'

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class HomebridgeProxmoxPlatform implements DynamicPlatformPlugin {
	public readonly Service: typeof Service = this.api.hap.Service
	public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic

	// this is used to track restored cached accessories
	public readonly accessories: PlatformAccessory[] = []
	public readonly proxmox: Proxmox.Api
	public nodes: Proxmox.nodesIndex[] = []

	constructor(
		public readonly log: Logger,
		public readonly config: PlatformConfig,
		public readonly api: API,
	) {

		// authorize self signed cert if you do not use a valid SSL certificat
		if (this.config.ssl) {
			process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
		}

		this.proxmox = proxmoxApi({ host: this.config.host, password: this.config.password, username: this.config.username })
		if (this.config.debug) this.log.debug('Finished initializing platform')


		// When this event is fired it means Homebridge has restored all cached accessories from disk.
		// Dynamic Platform plugins should only register new accessories after this event was fired,
		// in order to ensure they weren't added to homebridge already. This event can also be used
		// to start discovery of new accessories.
		this.api.on('didFinishLaunching', async () => {
			// run the method to discover / register your devices as accessories
			this.nodes = await this.proxmox.nodes.$get()
			await this.setup()
			if (this.config.debug) this.log.debug('Executed didFinishLaunching callback')
		})
	}

	async setup() {
		for (const node of this.nodes) {
			const theNode = this.proxmox.nodes.$(node.node)
			// list Qemu VMS
			const qemus = await theNode.qemu.$get({ full: true })

			// iterate Qemu VMS
			for (const qemu of qemus) {
				// do some suff.
				const status = await theNode.qemu.$(qemu.vmid).status.current.$get()
				this.registerDevice(qemu, status.name as string, node.node)
			}

			const lxcs = await theNode.lxc.$get()
			for (const lxc of lxcs) {
				const status = await theNode.lxc.$(lxc.vmid).status.current.$get()
				this.registerDevice(lxc, status.name as string, node.node)
			}
		}
	}

	/**
	 * This function is invoked when homebridge restores cached accessories from disk at startup.
	 * It should be used to setup event handlers for characteristics and update respective values.
	 */
	configureAccessory(accessory: PlatformAccessory) {
		this.log.info('Loading accessory from cache:', accessory.displayName)

		// add the restored accessory to the accessories cache so we can track if it has already been registered
		this.accessories.push(accessory)
	}

	/**
	 * This is an example method showing how to register discovered accessories.
	 * Accessories must only be registered once, previously created accessories
	 * must not be registered again to prevent "duplicate UUID" errors.
	 */
	registerDevice(
		vm: Proxmox.nodesQemuVm | Proxmox.nodesLxcVm,
		name: string,
		nodeName: string,
	) {

		// EXAMPLE ONLY
		// A real plugin you would discover accessories from the local network, cloud services
		// or a user-defined array in the platform config.

		const uuid = this.api.hap.uuid.generate(`${vm.vmid}${name}`)
		const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid)

		if (existingAccessory) {
			// the accessory already exists
			this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName)

			// create the accessory handler for the restored accessory
			// this is imported from `platformAccessory.ts`
			new ProxmoxPlatformAccessory(this, existingAccessory)


		} else {
			// the accessory does not yet exist, so we need to create it
			this.log.info('Adding new accessory:', name)

			// create a new accessory
			const accessory = new this.api.platformAccessory(name, uuid)

			// store a copy of the device object in the `accessory.context`
			// the `context` property can be used to store any data about the accessory you may need
			accessory.context.device = {
				vmId: vm.vmid,
				vmName: name,
				nodeName,
			}

			// create the accessory handler for the newly create accessory
			// this is imported from `platformAccessory.ts`
			new ProxmoxPlatformAccessory(this, accessory)

			// link the accessory to your platform
			this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
		}
	}
}
