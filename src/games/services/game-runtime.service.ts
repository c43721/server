import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { GamesService } from './games.service';
import { ServerConfiguratorService } from './server-configurator.service';
import { GameServersService } from '@/game-servers/services/game-servers.service';
import { RconFactoryService } from './rcon-factory.service';
import { PlayersService } from '@/players/services/players.service';
import { addGamePlayer, delGamePlayer, say } from '../utils/rcon-commands';
import { GameSlot } from '../models/game-slot';
import { Rcon } from 'rcon-client/lib';
import { Events } from '@/events/events';
import { SlotStatus } from '../models/slot-status';
import { GameState } from '../models/game-state';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Game, GameDocument } from '../models/game';
import { plainToInstance } from 'class-transformer';
import { GameServerNotAssignedError } from '../errors/game-server-not-assigned.error';
import { GameServerCleanUpService } from './game-server-clean-up.service';

@Injectable()
export class GameRuntimeService {
  private logger = new Logger(GameRuntimeService.name);

  constructor(
    @Inject(forwardRef(() => GamesService)) private gamesService: GamesService,
    private gameServersService: GameServersService,
    private serverConfiguratorService: ServerConfiguratorService,
    private rconFactoryService: RconFactoryService,
    @Inject(forwardRef(() => PlayersService))
    private playersService: PlayersService,
    private events: Events,
    @InjectModel(Game.name) private gameModel: Model<GameDocument>,
    private gameServerCleanUpService: GameServerCleanUpService,
  ) {}

  async reconfigure(gameId: string) {
    let game = await this.gamesService.getById(gameId);
    if (!game.gameServer) {
      throw new Error('this game has no server assigned');
    }

    this.logger.verbose(`game #${game.number} is being reconfigured`);

    game = await this.gamesService.update(game.id, {
      $set: { connectString: null, stvConnectString: null },
      $inc: { connectInfoVersion: 1 },
    });

    try {
      const { connectString, stvConnectString } =
        await this.serverConfiguratorService.configureServer(game.id);
      game = await this.gamesService.update(game.id, {
        $set: {
          connectString,
          stvConnectString,
        },
        $inc: {
          connectInfoVersion: 1,
        },
      });
    } catch (e) {
      this.logger.error(e.message);
    }

    return game;
  }

  async forceEnd(gameId: string, adminId?: string) {
    const game = plainToInstance(
      Game,
      await this.gameModel
        .findByIdAndUpdate(
          gameId,
          {
            state: GameState.interrupted,
            endedAt: new Date(),
            error: 'ended by admin',
            'slots.$[element].status': SlotStatus.active,
          },
          {
            new: true,
            arrayFilters: [
              { 'element.status': { $eq: SlotStatus.waitingForSubstitute } },
            ],
          },
        )
        .orFail()
        .lean()
        .exec(),
    );

    this.events.gameChanges.next({ game, adminId });
    this.events.substituteRequestsChange.next();

    await Promise.all(
      game.slots
        .map((slot) => slot.player)
        .map((playerId) =>
          this.playersService.updatePlayer(playerId.toString(), {
            $unset: { activeGame: 1 },
          }),
        ),
    );

    this.logger.verbose(`game #${game.number} force ended`);
    await this.gameServerCleanUpService.cleanupUnusedGameServers();
    return game;
  }

  async replacePlayer(
    gameId: string,
    replaceeId: string,
    replacementSlot: GameSlot,
  ) {
    const game = await this.gamesService.getById(gameId);
    if (!game.gameServer) {
      throw new GameServerNotAssignedError(gameId);
    }

    const gameServer = await this.gameServersService.getById(
      game.gameServer.toString(),
    );
    let rcon: Rcon;

    try {
      rcon = await this.rconFactoryService.createRcon(gameServer);
      const player = await this.playersService.getById(replacementSlot.player);

      const cmd = addGamePlayer(
        player.steamId,
        player.name,
        replacementSlot.team,
        replacementSlot.gameClass,
      );
      this.logger.debug(cmd);
      await rcon.send(cmd);

      const replacee = await this.playersService.getById(replaceeId);
      const cmd2 = delGamePlayer(replacee?.steamId);
      this.logger.debug(cmd2);
      await rcon.send(cmd2);
    } catch (e) {
      this.logger.error(
        `Error replacing the player on the game server: ${e.message}`,
      );
    } finally {
      await rcon?.end();
    }
  }

  async sayChat(gameServerId: string, message: string) {
    const gameServer = await this.gameServersService.getById(gameServerId);
    let rcon: Rcon;
    try {
      rcon = await this.rconFactoryService.createRcon(gameServer);
      await rcon.send(say(message));
    } catch (e) {
      this.logger.error(e.message);
    } finally {
      await rcon?.end();
    }
  }
}
