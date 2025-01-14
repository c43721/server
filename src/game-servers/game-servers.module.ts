import { forwardRef, Module } from '@nestjs/common';
import { GameServer, GameServerSchema } from './models/game-server';
import { GameServersService } from './services/game-servers.service';
import { GameServersController } from './controllers/game-servers.controller';
import { GameServerDiagnosticsService } from './services/game-server-diagnostics.service';
import {
  GameServerDiagnosticRun,
  gameServerDiagnosticRunSchema,
} from './models/game-server-diagnostic-run';
import { GameServerDiagnosticsController } from './controllers/game-server-diagnostics.controller';
import { RconConnection } from './diagnostic-checks/rcon-connection';
import { LogForwarding } from './diagnostic-checks/log-forwarding';
import { LogReceiverModule } from '@/log-receiver/log-receiver.module';
import { MongooseModule } from '@nestjs/mongoose';
import { GamesModule } from '@/games/games.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GameServer.name, schema: GameServerSchema },
      {
        name: GameServerDiagnosticRun.name,
        schema: gameServerDiagnosticRunSchema,
      },
    ]),
    LogReceiverModule,
    forwardRef(() => GamesModule),
  ],
  providers: [
    GameServersService,
    GameServerDiagnosticsService,
    RconConnection,
    LogForwarding,
  ],
  exports: [GameServersService],
  controllers: [GameServersController, GameServerDiagnosticsController],
})
export class GameServersModule {}
