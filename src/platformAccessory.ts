import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge'
import os from 'node:os'

import { HomebridgeProxmoxPlatform } from './platform'

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class ProxmoxPlatformAccessory {
	private service: Service

	/**
	 * These are just used to create a working example
	 * You should implement your own code to track the state of your accessory
	 */
	private state = false
	private context: {
		vmId: number
		vmName: string
		nodeName: string
		isQemu: boolean
		isLxc: boolean
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private qemu: any
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private lxc: any

	constructor(
		private readonly platform: HomebridgeProxmoxPlatform,
		private readonly accessory: PlatformAccessory,
	) {

		const context = this.accessory.context.device
		this.context = {
			vmId: context.vmId,
			vmName: context.vmName,
			nodeName: context.vmName,
			isQemu: context.isQemu,
			isLxc: context.isLxc,
		}
		this.setup()

		// set accessory information
		this.accessory.getService(this.platform.Service.AccessoryInformation)!
			.setCharacteristic(this.platform.Characteristic.Manufacturer, os.hostname())
			.setCharacteristic(this.platform.Characteristic.Model, os.platform())
			.setCharacteristic(this.platform.Characteristic.SerialNumber, os.release())

		// get the Switch service if it exists, otherwise create a new Switch service
		// you can create multiple services for each accessory
		this.service = this.accessory.getService(this.platform.Service.Switch) || this.accessory.addService(this.platform.Service.Switch)

		// set the service name, this is what is displayed as the default name on the Home app
		// in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
		this.service.setCharacteristic(this.platform.Characteristic.Name, this.context.vmName)

		// each service must implement at-minimum the "required characteristics" for the given service type
		// see https://developers.homebridge.io/#/service/Switch

		// register handlers for the On/Off Characteristic
		this.service.getCharacteristic(this.platform.Characteristic.On)
			.onSet(this.setOn.bind(this))                // SET - bind to the `setOn` method below
			.onGet(this.getOn.bind(this))               // GET - bind to the `getOn` method below

		/* setInterval(() => {
			this.fetchState()
		}, 10 * 1000) */
	}

	private async setup() {
		for (const node of this.platform.nodes) {
			const theNode = this.platform.proxmox.nodes.$(node.node)

			if (this.context.isQemu) {
				// list Qemu VMS
				const qemus = await theNode.qemu.$get({ full: true })

				// iterate Qemu VMS
				for (const qemu of qemus) {
					if (qemu.vmid === this.context.vmId && node.node === this.context.nodeName) {
						this.qemu = theNode.qemu.$(this.context.vmId)
					}
				}
			}

			if (this.context.isLxc) {
				// list Lxc VMS
				const lxcs = await theNode.lxc.$get()

				for (const lxc of lxcs) {
					if (lxc.vmid === this.context.vmId && node.node === this.context.nodeName) {
						this.lxc = theNode.lxc.$(this.context.vmId)
					}
				}
			}

		}
	}

	/**
	 * Handle "SET" requests from HomeKit
	 * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
	 */
	async setOn(value: CharacteristicValue) {
		const bool = value as boolean
		if (this.platform.config.debug) this.platform.log.debug(`${this.accessory.displayName} setOn: ${bool}`)
		this.switchState(bool).catch(() => {
			throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE)
		})
		throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE)
	}

	private async switchState(state: boolean) {
		let switched = false

		if (this.context.isQemu) {
			if (state) await this.qemu.status.start.$post()
			else await this.qemu.status.stop.$post()
			switched = true
		}

		if (this.context.isLxc) {
			if (state) await this.lxc.status.start.$post()
			else await this.lxc.status.stop.$post()
			switched = true
		}

		if (switched) {
			this.state = state
			this.service.updateCharacteristic(this.platform.Characteristic.On, state)
			if (this.platform.config.debug) this.platform.log.debug(`switchState success and current state is: ${state}`)
		}
	}

	/**
	 * Handle the "GET" requests from HomeKit
	 * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
	 *
	 * GET requests should return as fast as possbile. A long delay here will result in
	 * HomeKit being unresponsive and a bad user experience in general.
	 *
	 * If your device takes time to respond you should update the status of your device
	 * asynchronously instead using the `updateCharacteristic` method instead.

	 * @example
	 * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
	 */
	getOn(): CharacteristicValue {
		// if you need to return an error to show the device as "Not Responding" in the Home app:
		// throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE)
		if (this.platform.config.debug) this.platform.log.debug(`${this.accessory.displayName} getOn`)
		this.fetchState().catch(() => {
			throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE)
		})
		return this.state
	}

	/**
	 * Return state async and set it
	 */
	private async fetchState() {
		let isOn = false
		let status = ''

		if (this.context.isQemu) {
			const res = await this.qemu.status.current.$get()
			status = res.status
		}

		if (this.context.isLxc) {
			const res = await this.lxc.status.current.$get()
			status = res.tatus
		}

		if (status === 'stopped') {
			isOn = false
		} else {
			isOn = true
		}

		if (this.platform.config.debug) this.platform.log.debug(`${this.accessory.displayName} fetchState: ${isOn}`)
		this.state = isOn
		this.service.updateCharacteristic(this.platform.Characteristic.On, isOn)
		return isOn
	}
}
