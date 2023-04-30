// DOCUMENTED
import Rete from 'rete'
import { InputControl } from '../../dataControls/InputControl'
import { MagickComponent } from '../../engine'
import { eventSocket, stringSocket, triggerSocket } from '../../sockets'
import {
  AgentTask,
  MagickNode,
  MagickWorkerInputs,
  MagickWorkerOutputs,
  ModuleContext,
  WorkerData,
} from '../../types'

/**
 * Information about the CreateTask class
 */
const info = 'Create a new task which will be run by the agent'

/**
 * CreateTask class that extends MagickComponent
 */
export class CreateTask extends MagickComponent<Promise<{ task: AgentTask }>> {
  constructor() {
    super(
      'Create Task',
      { outputs: { trigger: 'option', task: 'output' } },
      'Task',
      info
    )
  }

  /**
   * Builder function to configure the node for task storage
   * @param node
   */
  builder(node: MagickNode) {
    const type = new InputControl({
      dataKey: 'type',
      name: 'Type',
      icon: 'moon',
      placeholder: 'task',
    })

    const objective = new Rete.Input('objective', 'Objective', stringSocket)
    node.inspector.add(type)

    const dataInput = new Rete.Input('trigger', 'Trigger', triggerSocket, true)
    const event = new Rete.Input('event', 'Event', eventSocket)
    const dataOutput = new Rete.Output('trigger', 'Trigger', triggerSocket)

    return node
      .addInput(dataInput)
      .addInput(objective)
      .addInput(event)
      .addOutput(dataOutput)
  }

  /**
   * Worker function to process and store the task
   * @param node
   * @param inputs
   * @param _outputs
   * @param context
   */
  async worker(
    node: WorkerData,
    inputs: MagickWorkerInputs,
    _outputs: MagickWorkerOutputs,
    context: ModuleContext
  ) {
    const { projectId } = context

    const objective = inputs['objective'][0] as AgentTask
    const event = inputs['event'][0] as Event

    const data = {
      objective,
      status: 'started',
      eventData: event,
      projectId,
      steps: [],
    }

    const { app } = context.module
    const taskResponse = await app?.service('tasks').create(data)
    // get the task data from the response
    const task = taskResponse?.data as AgentTask
    // return the task
    return { task }
  }
}