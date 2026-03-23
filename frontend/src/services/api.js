import axios from 'axios';

const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api' });

export const getStudent = (studentId) => api.get(`/students/${studentId}`);
export const getPaymentInstructions = (studentId) => api.get(`/payments/instructions/${studentId}`);
export const getStudentPayments = (studentId) => api.get(`/payments/${studentId}`);
export const verifyPayment = (txHash) => api.post('/payments/verify', { txHash });
export const syncPayments = () => api.post('/payments/sync');
export const getFeeStructures = () => api.get('/fees');
export const createFeeStructure = (data) => api.post('/fees', data);
export const getFeeByClass = (className) => api.get(`/fees/${className}`);

