import { mongooseTestingModule } from '@/utils/testing-mongoose-module';
import { Test, TestingModule } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { DocumentsService } from './documents.service';
import { Document, DocumentDocument, documentSchema } from '../models/document';
import { Connection, Error, Model } from 'mongoose';
import {
  getConnectionToken,
  getModelToken,
  MongooseModule,
} from '@nestjs/mongoose';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let mongod: MongoMemoryServer;
  let documentModel: Model<DocumentDocument>;
  let connection: Connection;

  beforeAll(async () => (mongod = await MongoMemoryServer.create()));
  afterAll(async () => await mongod.stop());

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        mongooseTestingModule(mongod),
        MongooseModule.forFeature([
          { name: Document.name, schema: documentSchema },
        ]),
      ],
      providers: [DocumentsService],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
    documentModel = module.get(getModelToken(Document.name));
    connection = module.get(getConnectionToken());
  });

  afterEach(async () => {
    await documentModel.deleteMany({});
    await connection.close();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('#onModuleInit()', () => {
    it('should create default rules document', async () => {
      await service.onModuleInit();
      expect(
        await documentModel.findOne({ name: 'rules', language: 'en' }),
      ).toBeTruthy();
    });
  });

  describe('#getDocument()', () => {
    describe('when a given document exists', () => {
      beforeEach(async () => {
        await documentModel.create({
          name: 'test',
          language: 'en',
          body: 'just testing',
        });
      });

      it('should return the document', async () => {
        const ret = await service.getDocument('test', 'en');
        expect(ret).toBeTruthy();
        expect(ret.name).toEqual('test');
        expect(ret.language).toEqual('en');
        expect(ret.body).toEqual('just testing');
      });
    });

    describe('when the given document does not exist', () => {
      it('should throw an error', async () => {
        await expect(service.getDocument('test')).rejects.toThrow(
          Error.DocumentNotFoundError,
        );
      });
    });
  });

  describe('#saveDocument', () => {
    it('should save the document', async () => {
      const ret = await service.saveDocument('test', 'en', 'just testing');
      expect(ret).toBeTruthy();
      expect(ret.name).toEqual('test');
      expect(ret.language).toEqual('en');
      expect(ret.body).toEqual('just testing');

      const doc = await documentModel.findOne({ name: 'test', language: 'en' });
      expect(doc).toMatchObject(ret);
    });
  });
});
