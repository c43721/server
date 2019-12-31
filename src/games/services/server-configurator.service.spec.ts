import { Test, TestingModule } from '@nestjs/testing';
import { ServerConfiguratorService } from './server-configurator.service';
import { Environment } from '@/environment/environment';
import { PlayersService } from '@/players/services/players.service';
import { QueueConfigService } from '@/queue/services/queue-config.service';

class EnvironmentStub {

}

class PlayersServiceStub {

}

class QueueConfigServiceStub {

}

describe('ServerConfiguratorService', () => {
  let service: ServerConfiguratorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServerConfiguratorService,
        { provide: Environment, useClass: EnvironmentStub },
        { provide: PlayersService, useClass: PlayersServiceStub },
        { provide: QueueConfigService, useClass: QueueConfigServiceStub },
      ],
    }).compile();

    service = module.get<ServerConfiguratorService>(ServerConfiguratorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
