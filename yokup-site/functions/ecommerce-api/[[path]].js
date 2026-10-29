import {shopApi} from '../_shared/ecommerce-shop.mjs';
export const onRequest=context=>shopApi(context.request);
