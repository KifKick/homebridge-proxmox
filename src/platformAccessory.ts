/* eslint-disable max-len */
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
	private node: any
	private isNodeReady = false
	private lastUpdateDate: Date

	constructor(
		private readonly platform: HomebridgeProxmoxPlatform,
		private readonly accessory: PlatformAccessory,
	) {

		const context = this.accessory.context.device
		this.context = {
			vmId: context.vmId,
			vmName: context.vmName,
			nodeName: context.nodeName,
			isQemu: context.isQemu,
			isLxc: context.isLxc,
		}
		const date = new Date()
		date.setSeconds(date.getSeconds() - 11)
		this.lastUpdateDate = date

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
			//console.log(node.node)

			if (this.context.isQemu) {
				if (this.platform.config.debug) this.platform.log.debug(`${this.accessory.displayName} SETUP isQemu`)
				//console.log(this.context)
				// list Qemu VMS
				const qemus = await theNode.qemu.$get({ full: true })

				// iterate Qemu VMS
				for (const qemu of qemus) {
					if (qemu.vmid === this.context.vmId && node.node === this.context.nodeName) {
						if (this.platform.config.debug) this.platform.log.debug(`${this.accessory.displayName} SETUP isQemu -> found correct qemu`)
						this.node = theNode
						this.isNodeReady = true
					}
				}
			}

			if (this.context.isLxc) {
				if (this.platform.config.debug) this.platform.log.debug(`${this.accessory.displayName} SETUP isLxc`)
				//console.log(this.context)
				// list Lxc VMS
				const lxcs = await theNode.lxc.$get()

				for (const lxc of lxcs) {
					if (lxc.vmid === this.context.vmId && node.node === this.context.nodeName) {
						if (this.platform.config.debug) this.platform.log.debug(`${this.accessory.displayName} SETUP isLxc -> found correct lxc`)
						this.node = theNode
						this.isNodeReady = true
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
		this.lastUpdateDate = new Date()
		this.switchState(bool)
	}

	private async switchState(state: boolean) {
		if (!this.isNodeReady) return
		let switched = false

		if (this.context.isQemu) {
			try {
				if (state) await this.node.qemu.$(this.context.vmId).status.start.$post()
				else await this.node.qemu.$(this.context.vmId).status.stop.$post()
				switched = true
			} catch (error) { }


		}

		if (this.context.isLxc) {
			try {
				if (state) await this.node.lxc.$(this.context.vmId).status.start.$post()
				else await this.node.lxc.$(this.context.vmId).status.stop.$post()
				switched = true
			} catch (error) { }

		}

		if (switched) {
			this.state = state
			this.service.updateCharacteristic(this.platform.Characteristic.On, state)
			if (this.platform.config.debug) this.platform.log.debug(`${this.accessory.displayName} switchState success and current state is: ${state}`)
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
		if (Math.abs((new Date().getTime() - this.lastUpdateDate.getTime()) / 1000) < 10) return this.state

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
		if (!this.isNodeReady) return false
		if (Math.abs((new Date().getTime() - this.lastUpdateDate.getTime()) / 1000) < 10) return this.state

		let isOn = false
		let status = ''

		if (this.context.isQemu) {
			const res = await this.node.qemu.$(this.context.vmId).status.current.$get()
			status = res.status
		}

		if (this.context.isLxc) {
			const res = await this.node.lxc.$(this.context.vmId).status.current.$get()
			status = res.status
		}

		if (status === 'stopped') {
			isOn = false
		}
		if (status === 'running') {
			isOn = true
		}

		// eslint-disable-next-line max-len
		if (this.platform.config.debug) this.platform.log.debug(`${this.accessory.displayName} fetchState: status is ${status}, state is: ${isOn}`)
		this.state = isOn
		this.service.updateCharacteristic(this.platform.Characteristic.On, isOn)
		return isOn
	}
}
