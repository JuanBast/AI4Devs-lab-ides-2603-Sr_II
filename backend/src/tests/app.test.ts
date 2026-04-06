import request from 'supertest';
import { app } from '../index';
import { Request, Response, NextFunction } from 'express'; // Import the necessary types

describe('GET /', () => {
    it('responds with Hello LTI!!', async () => {
        const response = await request(app).get('/');
        expect(response.statusCode).toBe(200);
        expect(response.text).toBe('Hello LTI!!');
    });
});
