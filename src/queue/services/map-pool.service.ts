import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Validator } from 'jsonschema';
import * as mapPoolSchema from '../map-pool.schema.json';
import * as defaultMapPool from '../map-pool.default.json';
import { Events } from '@/events/events';
import { Map, MapDocument } from '../models/map';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  filter,
  of,
  switchMap,
  takeUntil,
  interval,
  retryWhen,
  delayWhen,
  timeout,
  timer,
} from 'rxjs';

@Injectable()
export class MapPoolService implements OnModuleInit {
  private logger = new Logger(MapPoolService.name);

  constructor(
    @InjectModel(Map.name) private mapModel: Model<MapDocument>,
    private events: Events,
  ) {
    new Validator().validate(defaultMapPool, mapPoolSchema, {
      throwError: true,
    });
  }

  async onModuleInit() {
    const mapCount = await this.mapModel.countDocuments();
    if (mapCount === 0) {
      this.logger.log(
        'Map pool empty! Initializing it with the default one...',
      );
      await this.mapModel.insertMany(defaultMapPool.maps);
    }

    const queueEmpty = this.events.queueSlotsChange.pipe(
      filter(({ slots }) => slots.every((s) => s.playerId === null)),
    );

    queueEmpty.subscribe((s) => this.logger.debug('queue empty'));

    const queueNotEmpty = this.events.queueSlotsChange.pipe(
      filter(({ slots }) => slots.some((s) => s.playerId)),
    );

    queueNotEmpty.subscribe((s) => this.logger.debug('queue filling up'));

    queueEmpty
      .pipe(
        takeUntil(queueNotEmpty),
        retryWhen((errors) =>
          errors.pipe(
            delayWhen(() => timer(5000)),
            switchMap(() => of(this.refreshMaps())),
          ),
        ),
      )
      .subscribe((s) => this.logger.verbose('queue empty, refreshing maps'));

    await this.refreshMaps();
  }

  async getMaps(): Promise<Map[]> {
    return this.mapModel.find();
  }

  async addMap(map: Map): Promise<Map> {
    const ret = await this.mapModel.create(map);
    this.refreshMaps();
    return ret;
  }

  async removeMap(mapName: string): Promise<Map> {
    const ret = await this.mapModel.findOneAndRemove({ name: mapName });
    this.refreshMaps();
    return ret;
  }

  async setMaps(maps: Map[]): Promise<Map[]> {
    await this.mapModel.deleteMany({});
    const ret = await this.mapModel.insertMany(maps);
    this.refreshMaps();
    return ret;
  }

  private async refreshMaps() {
    const maps = await this.getMaps();
    this.events.mapPoolChange.next({ maps });
  }
}
