import { Test, TestingModule } from '@nestjs/testing';
import { QueueGateway } from './queue.gateway';
import { QueueService } from '../services/queue.service';
import { Subject } from 'rxjs';

class QueueServiceStub {
  slotsChange = new Subject<any>();
  stateChange = new Subject<string>();

  join(slotId: number, playerId: string) {
    return new Promise(resolve => resolve([{ id: slotId, playerId }]));
  }

  leave(playerId: string) {
    return { id: 0, playerId };
  }

  readyUp(playerId: string) {
    return { id: 0, playerId, ready: true };
  }
}

describe('QueueGateway', () => {
  let gateway: QueueGateway;
  let queueService: QueueServiceStub;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueGateway,
        { provide: QueueService, useClass: QueueServiceStub },
      ],
    }).compile();

    gateway = module.get<QueueGateway>(QueueGateway);
    queueService = module.get(QueueService);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('#joinQueue()', () => {
    it('should join the queue', async () => {
      const spy = spyOn(queueService, 'join').and.callThrough();
      const ret = await gateway.joinQueue({ request: { user: { id: 'FAKE_ID' } } }, { slotId: 5 });
      expect(spy).toHaveBeenCalledWith(5, 'FAKE_ID');
      expect(ret).toEqual([ { id: 5, playerId: 'FAKE_ID' } ] as any);
    });
  });

  describe('#leaveQueue()', () => {
    it('should leave the queue', () => {
      const spy = spyOn(queueService, 'leave').and.callThrough();
      const ret = gateway.leaveQueue({ request: { user: { id: 'FAKE_ID' } } });
      expect(spy).toHaveBeenCalledWith('FAKE_ID');
      expect(ret).toEqual({ id: 0, playerId: 'FAKE_ID' } as any);
    });
  });

  describe('#playerReady()', () => {
    it('should ready up the player', () => {
      const spy = spyOn(queueService, 'readyUp').and.callThrough();
      const ret = gateway.playerReady({ request: { user: { id: 'FAKE_ID' } } });
      expect(spy).toHaveBeenCalledWith('FAKE_ID');
      expect(ret).toEqual({ id: 0, playerId: 'FAKE_ID', ready: true } as any);
    });
  });

  describe('#afterInit()', () => {
    const socket = { emit: (...args: any[]) => null };

    it('should subscribe to slot change event', () => {
      const spy = spyOn(socket, 'emit').and.callThrough();
      gateway.afterInit(socket as any);

      const slot = { id: 0, playerId: 'FAKE_ID', ready: true };
      queueService.slotsChange.next([ slot ]);
      expect(spy).toHaveBeenCalledWith('queue slots update', [ slot ]);
    });

    it('should subsribe to state change event', () => {
      const spy = spyOn(socket, 'emit').and.callThrough();
      gateway.afterInit(socket as any);

      queueService.stateChange.next('waiting');
      expect(spy).toHaveBeenCalledWith('queue state update', 'waiting');
    });
  });
});
