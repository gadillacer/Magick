import Agent from './Agent'
import { projectId, ENTITY_WEBSERVER_PORT_RANGE } from '@magickml/engine'
import { app } from './app'

// if the user is running the app locally, sort by their project id
// this way users can use our demo database without seeing each other's stuff
// for a multi-tenant case, until we have isolated pods for each user we isolate by project id
const isSingleUserMode = process.env.SINGLE_USER_MODE === 'true'
const query = isSingleUserMode ? { query: { projectId } } : {}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export class AgentManager {
  id = -1
  agents: { [id: string]: any } = {}
  lastAgentData: any
  newAgents: any
  availablePorts: number[] = []

  constructor() {
    this.id = 0
    console.log('Creating agent manager')
    this.onCreate()
  }

  async updateAgent() {
    this.newAgents = (await app.service('agents').find(query)).data
    await this.updateSpells()
    if (JSON.stringify(this.newAgents) === JSON.stringify(this.lastAgentData ?? [])) return // They are the same
    for (const i in this.newAgents) {
      console.log('New Agents: ', this.newAgents[i])
      try {
        let temp_agent = this.getAgent(this.newAgents[i].id)
        console.log('Inside TRY ')
        await temp_agent.onDestroy()
      } catch {
        console.log('Client Does not exist')
      }
      if (!this.newAgents[i].data) {
        console.warn('New agent is null data')
      }
      // else if (this.newAgents[i].data.discord_enabled) {
      //   try {
      //     //Get the agent which was updated.
      //     let temp_agent = this.getAgent(this.newAgents[i].id)
      //     //Delete the Agent
      //     await temp_agent.onDestroy()
      //   } catch (e) {
      //     console.log("Couldn't delete the Discord Client.!! Caught Error: ", e)
      //   }
      //   this.addAgent(this.newAgents[i])
      // }
    }
    // If an entry exists in lastAgentData but not in newAgents, it has been deleted
    for (const i in this.lastAgentData) {
      // filter for entries where lastAgentData where id === newAgents[i].id
      if (
        this.newAgents.filter((x: any) => x.id === this.lastAgentData[i].id)[0] === undefined
      ) {
        await this.removeAgent(this.lastAgentData[i].id)
      }
    }

    // If an entry exists in newAgents but not in lastAgentData, it has been added
    for (const i in this.newAgents) {
      // filter for entries where lastAgentData where id === newAgents[i].id
      if (
        this.lastAgentData.filter((x: any) => x.id === this.lastAgentData[i].id)[0] === undefined
      ) {
        if (this.newAgents[i].enabled) {
          if (!this.newAgents[i].data.discord_enabled)
            await this.addAgent(this.newAgents[i])
        }
      }
    }

    for (const i in this.newAgents) {
      if (this.newAgents[i].dirty) {
        await this.removeAgent(this.newAgents[i].id)
        await this.addAgent(this.newAgents[i])

        await app.service('agents').patch(this.newAgents[i].id, {
          dirty: false,
        })
      }
    }

    this.lastAgentData = this.newAgents
  }

  async updateSpells() {
    for (const i in this.newAgents) {
      const agent = this.newAgents[i]
      const runningAgent = this.getAgent(agent.id)
      if (!runningAgent) continue
      // evaluate the root spell
      if (agent.data.root_spell) {
        const spell = (
          await app.service('spells').find({
            query: { projectId, name: agent.data.root_spell },
          })
        ).data[0]

        if (
          !runningAgent.root_spell_hash ||
          spell.hash !== runningAgent.root_spell_hash
        ) {
          // reload the spell
          console.log('reloading root spell', spell.name)
          const spellRunner = await runningAgent.spellManager.load(spell)
          runningAgent.root_spell_hash = spell.hash
        }
      }

      // evaluate all spells
      if (agent.spells.length > 0) {
        // for each spell in agent.spells, get the hash from the db
        // if the hash is not the same as agent.spells.hash, then reload the spell
        // otherwise set agent.spells.hash to the hash of the spell
        const spells = (
          await app.service('spells').find({
            query: { projectId, name: { $in: agent.spells } },
          })
        ).data

        for (const j in spells) {
          const spell = spells[j]
          if (!runningAgent.spells_hash) runningAgent.spells_hash = []
          if (spell.hash !== runningAgent.spells_hash[j]) {
            // reload the spell
            console.log('reloading spell', spell.name)
            const spellRunner = await runningAgent.spellManager.load(spell)
            runningAgent.spells_hash[j] = spell.hash
          }
        }
      }
    }
  }

  async resetAgentSpells() {
    const agents = (await app.service('agents').find()).data
    for (const i in agents) {
      // rewrite as a feathers service call to empty
      //@ts-ignore
      await app.service('agents').patch(agents[i].id, {
        spells: [],
      })
    }
  }

  async onCreate() {
    const ports: string[] = ((ENTITY_WEBSERVER_PORT_RANGE?.split(
      '-'
    ) as any) ?? ['10001', '10100']) as string[]
    let portStart: number = parseInt(ports[0])
    let portEnd: number = parseInt(ports[1])
    if (portStart > portEnd) {
      const temp = portStart
      portStart = portEnd
      portEnd = temp
    }
    for (let i = portStart; i <= portEnd; i++) {
      this.availablePorts.push(i)
    }

    this.resetAgentSpells()
  }

  async onDestroy() {}

  async addAgent(obj: any) {
    const data = {
      ...obj.data,
      id: obj.id,
      enabled: obj.enabled,
      dirty: obj.dirty,
      spells: obj.spells,
      updated_at: obj.updated_at,
    }
    //Overwrites even if already exists
    data.projectId = projectId
    this.agents[data.id] = new Agent(data)
  }

  async removeAgent(id: string) {
    if (this.agentExists(id)) {
      await this.agents[id]?.onDestroy()
      this.agents[id] = null
      delete this.agents[id]
    }
  }

  getAgent(id: any) {
    let res = null

    for (let x in this.agents) {
      if (x == id) {
        res = this.agents[x]
      }
    }

    return res
  }

  agentExists(id: any) {
    return this.getAgent(id) !== null && this.getAgent(id) !== undefined
  }

  generateId(): number {
    let id = randomInt(0, 10000)
    while (this.agentExists(id)) {
      id = randomInt(0, 10000)
    }
    return id
  }

  getAvailablePort(): number {
    const port = this.availablePorts.pop()
    if (port === undefined) {
      throw new Error('No available ports')
    }
    return port
  }
}