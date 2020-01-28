import { Test, TestingModule } from '@nestjs/testing';
import { PlayerSubstitutionService } from './player-substitution.service';
import { GamesService } from './games.service';
import { PlayersService } from '@/players/services/players.service';
import { PlayerBansService } from '@/players/services/player-bans.service';
import { GameRuntimeService } from './game-runtime.service';
import { GamesGateway } from '../gateways/games.gateway';
import { SubstituteRequest } from '@/queue/substitute-request';
import { DiscordNotificationsService } from '@/discord/services/discord-notifications.service';
import { cloneDeep } from 'lodash';
import { QueueGateway } from '@/queue/gateways/queue.gateway';

const mockGame = {
  id: 'FAKE_GAME_ID',
  number: 1,
  players: [ 'FAKE_PLAYER_1', 'FAKE_PLAYER_2' ],
  slots: [
    {
      playerId: 'FAKE_PLAYER_1',
      teamId: '0',
      gameClass: 'soldier',
      status: 'active',
    },
    {
      playerId: 'FAKE_PLAYER_2',
      teamId: '1',
      gameClass: 'soldier',
      status: 'active',
    },
  ],
  map: 'cp_badlands',
  state: 'launching',
  teams: new Map([['0', 'RED'], ['1', 'BLU']]),
  save: () => null,
};

class GamesServiceStub {
  game = cloneDeep(mockGame);
  getById(id: string) {
    return new Promise(resolve => {
      if (id === 'FAKE_GAME_ID') {
        return resolve(this.game);
      } else {
        return resolve(null);
      }
    });
  }
  getPlayerActiveGame(playerId: string) { return new Promise(resolve => resolve(null)); }
}

class PlayersServiceStub {
  players = new Map<string, any>([
    [ 'FAKE_PLAYER_1', { id: 'FAKE_PLAYER_1' } ],
    [ 'FAKE_PLAYER_2', { id: 'FAKE_PLAYER_2' } ],
    [ 'FAKE_PLAYER_3', { id: 'FAKE_PLAYER_3' } ],
  ]);

  getById(id: string) {
    return new Promise(resolve => {
      const player = { ...this.players.get(id) };
      resolve(player);
    });
  }
}

class PlayerBansServiceStub {
  getPlayerActiveBans(playerId: string) { return []; }
}

class GameRuntimeServiceStub {
  replacePlayer(gameId: string, replaceeId: string, replacementSlot: any) { return null; }
}

class GamesGatewayStub {
  emitGameUpdated(game: any) { return null; }
}

class DiscordNotificationsServiceStub {
  notifySubstituteIsNeeded(substituteRequest: SubstituteRequest) { return null; }
}

class QueueGatewayStub {
  updateSubstituteRequests() { return null; }
}

describe('PlayerSubstitutionService', () => {
  let service: PlayerSubstitutionService;
  let gamesService: GamesServiceStub;
  let playersService: PlayersServiceStub;
  let playerBansService: PlayerBansServiceStub;
  let gameRuntimeService: GameRuntimeServiceStub;
  let gamesGateway: GamesGatewayStub;
  let discordNotificationsService: DiscordNotificationsServiceStub;
  let queueGateway: QueueGatewayStub;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerSubstitutionService,
        { provide: GamesService, useClass: GamesServiceStub },
        { provide: PlayersService, useClass: PlayersServiceStub },
        { provide: PlayerBansService, useClass: PlayerBansServiceStub },
        { provide: GameRuntimeService, useClass: GameRuntimeServiceStub },
        { provide: GamesGateway, useClass: GamesGatewayStub },
        { provide: DiscordNotificationsService, useClass: DiscordNotificationsServiceStub },
        { provide: QueueGateway, useClass: QueueGatewayStub },
      ],
    }).compile();

    service = module.get<PlayerSubstitutionService>(PlayerSubstitutionService);
    gamesService = module.get(GamesService);
    playersService = module.get(PlayersService);
    playerBansService = module.get(PlayerBansService);
    gameRuntimeService = module.get(GameRuntimeService);
    gamesGateway = module.get(GamesGateway);
    discordNotificationsService = module.get(DiscordNotificationsService);
    queueGateway = module.get(QueueGateway);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('#substitutePlayer()', () => {
    it('should throw an error if the given game doesn\'t exist', async () => {
      await expectAsync(service.substitutePlayer('wahtever', 'FAKE_PLAYER_1')).toBeRejectedWithError('no such game');
    });

    it('should throw an error if the given player does not exist', async () => {
      spyOn(playersService, 'getById').and.returnValue(null);
      await expectAsync(service.substitutePlayer('FAKE_GAME_ID', 'FAKE_PLAYER_4')).toBeRejectedWithError('no such player');
    });

    it('should throw an error if the given player has already been replaced', async () => {
      gamesService.game.slots[0].status = 'replaced';
      await expectAsync(service.substitutePlayer('FAKE_GAME_ID', 'FAKE_PLAYER_1')).toBeRejectedWithError('this player has already been replaced');
    });

    it('should update the player status', async () => {
      const spy = spyOn(gamesService.game, 'save');
      const game = await service.substitutePlayer('FAKE_GAME_ID', 'FAKE_PLAYER_1');
      expect(game).toEqual(gamesService.game as any);
      const tSlot = game.slots.find(s => s.playerId === 'FAKE_PLAYER_1');
      expect(tSlot.status).toEqual('waiting for substitute');
      expect(spy).toHaveBeenCalled();
    });

    it('should emit the  event', async () => {
      const spy = spyOn(gamesGateway, 'emitGameUpdated');
      const game = await service.substitutePlayer('FAKE_GAME_ID', 'FAKE_PLAYER_1');
      expect(spy).toHaveBeenCalledWith(game);
    });

    it('should reject if the game is no longer active', async () => {
      const game = { ...mockGame, state: 'ended' };
      spyOn(gamesService, 'getById').and.returnValue(game as any);

      expectAsync(service.substitutePlayer('FAKE_GAME_ID', 'FAKE_PLAYER_1')).toBeRejectedWithError('the game has already ended');
    });

    it('should notify on discord', async () => {
      const spy = spyOn(discordNotificationsService, 'notifySubstituteIsNeeded');
      await service.substitutePlayer('FAKE_GAME_ID', 'FAKE_PLAYER_1');
      expect(spy).toHaveBeenCalledWith({
        gameId: 'FAKE_GAME_ID',
        gameNumber: 1,
        gameClass: 'soldier',
        team: 'RED',
      });
    });

    it('should call gateway', async () => {
      const spy = spyOn(queueGateway, 'updateSubstituteRequests');
      await service.substitutePlayer('FAKE_GAME_ID', 'FAKE_PLAYER_1');
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('#cancelSubstitutionRequest()', () => {
    beforeEach(() => {
      gamesService.game.slots[0].status = 'waiting for substitute';
    });

    it('should throw an error if the given game does not exist', async () => {
      await expectAsync(service.cancelSubstitutionRequest('asdf34qfwdsaf', 'FAKE_PLAYER_1')).toBeRejectedWithError('no such game');
    });

    it('should throw an error if the given player does not exist', async () => {
      spyOn(playersService, 'getById').and.returnValue(null);
      await expectAsync(service.cancelSubstitutionRequest('FAKE_GAME_ID', 'FAKE_PLAYER_4')).toBeRejectedWithError('no such player');
    });

    it('should throw an error if the given player has already been replaced', async () => {
      gamesService.game.slots[0].status = 'replaced';
      await expectAsync(service.cancelSubstitutionRequest('FAKE_GAME_ID', 'FAKE_PLAYER_1')).toBeRejectedWithError('this player has already been replaced');
    });

    it('should update the player status', async () => {
      const spy = spyOn(gamesService.game, 'save');
      const game = await service.cancelSubstitutionRequest('FAKE_GAME_ID', 'FAKE_PLAYER_1');
      expect(game).toEqual(gamesService.game as any);
      expect(game.slots[0].status).toEqual('active');
      expect(spy).toHaveBeenCalled();
    });

    it('should emit the event', async () => {
      const spy = spyOn(gamesGateway, 'emitGameUpdated');
      const game = await service.cancelSubstitutionRequest('FAKE_GAME_ID', 'FAKE_PLAYER_1');
      expect(spy).toHaveBeenCalledWith(game);
    });

    it('should reject if the game is no longer active', async () => {
      gamesService.game.state = 'ended';
      expectAsync(service.cancelSubstitutionRequest('FAKE_GAME_ID', 'FAKE_PLAYER_1')).toBeRejectedWithError('the game has already ended');
    });

    it('should call gateway', async () => {
      const spy = spyOn(queueGateway, 'updateSubstituteRequests');
      const game = await service.cancelSubstitutionRequest('FAKE_GAME_ID', 'FAKE_PLAYER_1');
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('#replacePlayer()', () => {
    beforeEach(() => {
      gamesService.game.slots[0].status = 'waiting for substitute';
    });

    it('should replace the player', async () => {
      const spy = spyOn(gamesService.game, 'save');
      // replace player 1 with player 3
      const game = await service.replacePlayer('FAKE_GAME_ID', 'FAKE_PLAYER_1', 'FAKE_PLAYER_3');
      expect(game).toEqual(gamesService.game as any);
      const replaceeSlot = game.slots.find(s => s.playerId === 'FAKE_PLAYER_1');
      expect(replaceeSlot.status).toBe('replaced');
      const replacementSlot = game.slots.find(s => s.playerId === 'FAKE_PLAYER_3');
      expect(replacementSlot).toBeDefined();
      expect(replacementSlot.status).toBe('active');
      expect(game.players.find((p: any) => p.id === 'FAKE_PLAYER_3')).toBeDefined();
      expect(spy).toHaveBeenCalled();
    });

    it('should emit the event', async () => {
      const spy = spyOn(gamesGateway, 'emitGameUpdated');
      const game = await service.replacePlayer('FAKE_GAME_ID', 'FAKE_PLAYER_1', 'FAKE_PLAYER_3');
      expect(spy).toHaveBeenCalledWith(game);
    });

    it('should replace the player in-game', async done => {
      const spy = spyOn(gameRuntimeService, 'replacePlayer');
      await service.replacePlayer('FAKE_GAME_ID', 'FAKE_PLAYER_1', 'FAKE_PLAYER_3');
      setTimeout(() => {
        expect(spy).toHaveBeenCalledWith('FAKE_GAME_ID', 'FAKE_PLAYER_1', jasmine.objectContaining({ playerId: 'FAKE_PLAYER_3' }));
        done();
      }, 100);
    });

    it('should reject if the given player is banned', async () => {
      const end = new Date();
      end.setHours(end.getHours() + 1);
      const spy = spyOn(playerBansService, 'getPlayerActiveBans').and.returnValue([
        { player: 'FAKE_PLAYER_ID', admin: 'FAKE_ADMIN_ID', start: new Date(), end },
      ]);

      await expectAsync(service.replacePlayer('FAKE_GAME_ID', 'FAKE_PLAYER_1', 'FAKE_PLAYER_3'))
        .toBeRejectedWithError('player is banned');
      expect(spy).toHaveBeenCalledWith('FAKE_PLAYER_3');
    });

    it('should reject if replacee is marked as active', async () => {
      await expectAsync(service.replacePlayer('FAKE_GAME_ID', 'FAKE_PLAYER_2', 'FAKE_PLAYER_3'))
        .toBeRejectedWithError('the replacee is marked as active');
    });

    it('should mark the slot back as active if a player is subbing himself', async () => {
      const spy = spyOn(gamesService.game, 'save');
      const game = await service.replacePlayer('FAKE_GAME_ID', 'FAKE_PLAYER_1', 'FAKE_PLAYER_1');
      expect(game).toEqual(gamesService.game as any);
      const slot = game.slots.find(s => s.playerId === 'FAKE_PLAYER_1');
      expect(slot.status).toBe('active');
      expect(game.slots.length).toBe(2);
      expect(spy).toHaveBeenCalled();
    });

    it('should reject if the given player has already been replaced', async () => {
      await service.replacePlayer('FAKE_GAME_ID', 'FAKE_PLAYER_1', 'FAKE_PLAYER_3');
      expectAsync(service.replacePlayer('FAKE_GAME_ID', 'FAKE_PLAYER_1', 'FAKE_PLAYER_3'))
        .toBeRejectedWithError('this player has already been replaced');
    });

    it('should reject if the given player is involved in another game', async () => {
      spyOn(gamesService, 'getPlayerActiveGame').and.returnValue({ id: 'FAKE_GAME_ID' } as any);
      expectAsync(service.replacePlayer('FAKE_GAME_ID', 'FAKE_PLAYER_2', 'FAKE_PLAYER_3'))
        .toBeRejectedWithError('player is involved in a currently running game');
    });

    it('should call gateway', async () => {
      const spy = spyOn(queueGateway, 'updateSubstituteRequests');
      await service.replacePlayer('FAKE_GAME_ID', 'FAKE_PLAYER_1', 'FAKE_PLAYER_3');
      expect(spy).toHaveBeenCalled();
    });
  });
});