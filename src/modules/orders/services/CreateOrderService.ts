import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const checkCustomer = await this.customersRepository.findById(customer_id);

    if (!checkCustomer) {
      throw new AppError('Customer not found');
    }

    const checkProducts = await this.productsRepository.findAllById(products);

    if (!checkProducts.length) {
      throw new AppError('Products not found');
    }

    const productsIds = checkProducts.map(product => product.id);
    const productIndex = checkProducts.findIndex(p => p.price);

    const checkInexistentProducts = products.filter(product => {
      return !productsIds.includes(product.id);
    });

    if (checkInexistentProducts.length) {
      throw new AppError(
        `Could not find product ${checkInexistentProducts}`,
        404,
      );
    }

    const findProductsWithNoQuantityAvailable = products.filter(
      product =>
        checkProducts.filter(p => p.id === product.id)[productIndex].quantity <
        product.quantity,
    );

    if (findProductsWithNoQuantityAvailable.length) {
      throw new AppError(
        `The quantity ${findProductsWithNoQuantityAvailable[productIndex].id} is not available`,
        400,
      );
    }

    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: checkProducts.filter(p => p.id)[productIndex].price,
    }));

    const order = await this.ordersRepository.create({
      customer: checkCustomer,
      products: serializedProducts,
    });

    const { order_products } = order;

    const orderedProductsQuantity = order_products.map(product => ({
      id: product.product_id,
      quantity:
        checkProducts.filter(p => p.id === product.product_id)[productIndex]
          .quantity - product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
