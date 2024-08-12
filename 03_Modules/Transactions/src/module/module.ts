// Copyright (c) 2023 S44, LLC
// Copyright Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache 2.0

import {
  AbstractModule,
  AsHandler,
  AttributeEnumType,
  AuthorizationStatusEnumType,
  CallAction,
  CostUpdatedRequest,
  CostUpdatedResponse,
  CrudRepository,
  ErrorCode,
  EventGroup,
  GetTransactionStatusResponse,
  HandlerProperties,
  ICache,
  IFileAccess,
  IMessage,
  IMessageHandler,
  IMessageSender,
  MeterValuesRequest,
  MeterValuesResponse,
  MeterValueUtils,
  OcppError,
  StatusNotificationRequest,
  StatusNotificationResponse,
  SystemConfig,
  TransactionEventEnumType,
  TransactionEventRequest,
  TransactionEventResponse,
} from '@citrineos/base';
import {
  Component,
  IAuthorizationRepository,
  IDeviceModelRepository,
  ILocationRepository,
  IReservationRepository,
  ITariffRepository,
  ITransactionEventRepository,
  sequelize,
  SequelizeRepository,
  Tariff,
  Transaction,
  VariableAttribute,
} from '@citrineos/data';
import {
  IAuthorizer,
  RabbitMqReceiver,
  RabbitMqSender,
  SignedMeterValuesUtil,
  Timer,
} from '@citrineos/util';
import deasyncPromise from 'deasync-promise';
import { ILogObj, Logger } from 'tslog';
import { TransactionService } from './TransactionService';
import { StatusNotificationService } from './StatusNotificationService';

/**
 * Component that handles transaction related messages.
 */
export class TransactionsModule extends AbstractModule {
  protected _requests: CallAction[] = [
    CallAction.MeterValues,
    CallAction.StatusNotification,
    CallAction.TransactionEvent,
  ];
  protected _responses: CallAction[] = [
    CallAction.CostUpdated,
    CallAction.GetTransactionStatus,
  ];

  protected _transactionEventRepository: ITransactionEventRepository;
  protected _authorizeRepository: IAuthorizationRepository;
  protected _deviceModelRepository: IDeviceModelRepository;
  protected _componentRepository: CrudRepository<Component>;
  protected _locationRepository: ILocationRepository;
  protected _tariffRepository: ITariffRepository;
  protected _reservationRepository: IReservationRepository;

  protected _transactionService: TransactionService;
  protected _statusNotificationService: StatusNotificationService;

  protected _fileAccess: IFileAccess;

  private readonly _authorizers: IAuthorizer[];

  private readonly _signedMeterValuesUtil: SignedMeterValuesUtil;

  private readonly _sendCostUpdatedOnMeterValue: boolean | undefined;
  private readonly _costUpdatedInterval: number | undefined;

  /**
   * This is the constructor function that initializes the {@link TransactionsModule}.
   *
   * @param {SystemConfig} config - The `config` contains configuration settings for the module.
   *
   * @param {ICache} [cache] - The cache instance which is shared among the modules & Central System to pass information such as blacklisted actions or boot status.
   *
   * @param {IFileAccess} [fileAccess] - The `fileAccess` allows access to the configured file storage.
   *
   * @param {IMessageSender} [sender] - The `sender` parameter is an optional parameter that represents an instance of the {@link IMessageSender} interface.
   * It is used to send messages from the central system to external systems or devices. If no `sender` is provided, a default {@link RabbitMqSender} instance is created and used.
   *
   * @param {IMessageHandler} [handler] - The `handler` parameter is an optional parameter that represents an instance of the {@link IMessageHandler} interface.
   * It is used to handle incoming messages and dispatch them to the appropriate methods or functions. If no `handler` is provided, a default {@link RabbitMqReceiver} instance is created and used.
   *
   * @param {Logger<ILogObj>} [logger] - The `logger` parameter is an optional parameter that represents an instance of {@link Logger<ILogObj>}.
   * It is used to propagate system-wide logger settings and will serve as the parent logger for any sub-component logging. If no `logger` is provided, a default {@link Logger<ILogObj>} instance is created and used.
   *
   * @param {ITransactionEventRepository} [transactionEventRepository] - An optional parameter of type {@link ITransactionEventRepository} which represents a repository for accessing and manipulating transaction event data.
   * If no `transactionEventRepository` is provided, a default {@link sequelize:transactionEventRepository} instance
   * is created and used.
   *
   * @param {IAuthorizationRepository} [authorizeRepository] - An optional parameter of type {@link IAuthorizationRepository} which represents a repository for accessing and manipulating authorization data.
   * If no `authorizeRepository` is provided, a default {@link sequelize:authorizeRepository} instance is
   * created and used.
   *
   * @param {IDeviceModelRepository} [deviceModelRepository] - An optional parameter of type {@link IDeviceModelRepository} which represents a repository for accessing and manipulating variable attribute data.
   * If no `deviceModelRepository` is provided, a default {@link sequelize:deviceModelRepository} instance is
   * created and used.
   *
   * @param {CrudRepository<Component>} [componentRepository] - An optional parameter of type {@link CrudRepository<Component>} which represents a repository for accessing and manipulating component data.
   * If no `componentRepository` is provided, a default {@link sequelize:componentRepository} instance is
   * created and used.
   *
   * @param {ILocationRepository} [locationRepository] - An optional parameter of type {@link ILocationRepository} which represents a repository for accessing and manipulating location and charging station data.
   * If no `locationRepository` is provided, a default {@link sequelize:locationRepository} instance is
   * created and used.
   *
   * @param {CrudRepository<Component>} [componentRepository] - An optional parameter of type {@link CrudRepository<Component>} which represents a repository for accessing and manipulating component data.
   * If no `componentRepository` is provided, a default {@link sequelize:componentRepository} instance is
   * created and used.
   *
   * @param {ILocationRepository} [locationRepository] - An optional parameter of type {@link ILocationRepository} which represents a repository for accessing and manipulating location and charging station data.
   * If no `locationRepository` is provided, a default {@link sequelize:locationRepository} instance is
   * created and used.
   *
   * @param {ITariffRepository} [tariffRepository] - An optional parameter of type {@link ITariffRepository} which
   * represents a repository for accessing and manipulating tariff data.
   * If no `tariffRepository` is provided, a default {@link sequelize:tariffRepository} instance is
   * created and used.
   *
   * @param {IReservationRepository} [reservationRepository] - An optional parameter of type {@link IReservationRepository}
   * which represents a repository for accessing and manipulating reservation data.
   * If no `reservationRepository` is provided, a default {@link sequelize:reservationRepository} instance is created and used.
   *
   * @param {IAuthorizer[]} [authorizers] - An optional parameter of type {@link IAuthorizer[]} which represents
   * a list of authorizers that can be used to authorize requests.
   */
  constructor(
    config: SystemConfig,
    cache: ICache,
    fileAccess: IFileAccess,
    sender?: IMessageSender,
    handler?: IMessageHandler,
    logger?: Logger<ILogObj>,
    transactionEventRepository?: ITransactionEventRepository,
    authorizeRepository?: IAuthorizationRepository,
    deviceModelRepository?: IDeviceModelRepository,
    componentRepository?: CrudRepository<Component>,
    locationRepository?: ILocationRepository,
    tariffRepository?: ITariffRepository,
    reservationRepository?: IReservationRepository,
    authorizers?: IAuthorizer[],
  ) {
    super(
      config,
      cache,
      handler || new RabbitMqReceiver(config, logger),
      sender || new RabbitMqSender(config, logger),
      EventGroup.Transactions,
      logger,
    );

    const timer = new Timer();
    this._logger.info('Initializing...');

    if (!deasyncPromise(this._initHandler(this._requests, this._responses))) {
      throw new Error(
        'Could not initialize module due to failure in handler initialization.',
      );
    }

    this._fileAccess = fileAccess;

    this._transactionEventRepository =
      transactionEventRepository ||
      new sequelize.SequelizeTransactionEventRepository(config, logger);
    this._authorizeRepository =
      authorizeRepository ||
      new sequelize.SequelizeAuthorizationRepository(config, logger);
    this._deviceModelRepository =
      deviceModelRepository ||
      new sequelize.SequelizeDeviceModelRepository(config, logger);
    this._componentRepository =
      componentRepository ||
      new SequelizeRepository<Component>(config, Component.MODEL_NAME, logger);
    this._locationRepository =
      locationRepository ||
      new sequelize.SequelizeLocationRepository(config, logger);
    this._tariffRepository =
      tariffRepository ||
      new sequelize.SequelizeTariffRepository(config, logger);
    this._reservationRepository =
      reservationRepository ||
      new sequelize.SequelizeReservationRepository(config, logger);

    this._authorizers = authorizers || [];

    this._signedMeterValuesUtil = new SignedMeterValuesUtil(
      fileAccess,
      config,
      this._logger,
      this._deviceModelRepository,
    );

    this._sendCostUpdatedOnMeterValue =
      config.modules.transactions.sendCostUpdatedOnMeterValue;
    this._costUpdatedInterval = config.modules.transactions.costUpdatedInterval;

    this._transactionService = new TransactionService(
      this._transactionEventRepository,
      this._authorizeRepository,
      this._authorizers,
      this._logger,
    );

    this._statusNotificationService = new StatusNotificationService(
      this._componentRepository,
      this._deviceModelRepository,
      this._locationRepository,
      this._logger,
    );

    this._logger.info(`Initialized in ${timer.end()}ms...`);
  }

  get transactionEventRepository(): ITransactionEventRepository {
    return this._transactionEventRepository;
  }

  get authorizeRepository(): IAuthorizationRepository {
    return this._authorizeRepository;
  }

  get deviceModelRepository(): IDeviceModelRepository {
    return this._deviceModelRepository;
  }

  get tariffRepository(): ITariffRepository {
    return this._tariffRepository;
  }

  /**
   * Handle requests
   */

  @AsHandler(CallAction.TransactionEvent)
  protected async _handleTransactionEvent(
    message: IMessage<TransactionEventRequest>,
    props?: HandlerProperties,
  ): Promise<void> {
    this._logger.debug('Transaction event received:', message, props);
    const stationId: string = message.context.stationId;

    await this._transactionEventRepository.createOrUpdateTransactionByTransactionEventAndStationId(
      message.payload,
      stationId,
    );

    const transactionEvent = message.payload;
    const transactionId = transactionEvent.transactionInfo.transactionId;

    if (message.payload.reservationId) {
      await this._reservationRepository.updateAllByQuery(
        {
          terminatedByTransaction: transactionId,
          isActive: false,
        },
        {
          where: {
            id: message.payload.reservationId,
            stationId: stationId,
          },
        },
      );
    }

    if (transactionEvent.idToken) {
      const response = await this._transactionService.authorizeIdToken(
        transactionEvent,
        message.context,
      );
      this.sendCallResultWithMessage(message, response).then(
        (messageConfirmation) => {
          this._logger.debug(
            'Transaction response sent: ',
            messageConfirmation,
          );
        },
      );
      // If the transaction is accepted and interval is set, start the cost update
      if (
        transactionEvent.eventType === TransactionEventEnumType.Started &&
        response.idTokenInfo?.status === AuthorizationStatusEnumType.Accepted &&
        this._costUpdatedInterval
      ) {
        this._updateCost(
          stationId,
          transactionId,
          this._costUpdatedInterval,
          message.context.tenantId,
        );
      }
    } else {
      const response: TransactionEventResponse = {
        // TODO determine how to set chargingPriority and updatedPersonalMessage for anonymous users
      };

      const transaction: Transaction | undefined =
        await this._transactionEventRepository.readTransactionByStationIdAndTransactionId(
          stationId,
          transactionId,
        );

      if (message.payload.eventType === TransactionEventEnumType.Updated) {
        // I02 - Show EV Driver Running Total Cost During Charging
        if (
          transaction &&
          transaction.isActive &&
          this._sendCostUpdatedOnMeterValue
        ) {
          response.totalCost = await this._calculateTotalCost(
            stationId,
            transaction.id,
            transaction.totalKwh,
          );
        }

        // I06 - Update Tariff Information During Transaction
        const tariffAvailableAttributes: VariableAttribute[] =
          await this._deviceModelRepository.readAllByQuerystring({
            stationId: stationId,
            component_name: 'TariffCostCtrlr',
            variable_instance: 'Tariff',
            variable_name: 'Available',
            type: AttributeEnumType.Actual,
          });
        const supportTariff: boolean =
          tariffAvailableAttributes.length !== 0 &&
          Boolean(tariffAvailableAttributes[0].value);

        if (supportTariff && transaction && transaction.isActive) {
          this._logger.debug(
            `Checking if updated tariff information is available for traction ${transaction.transactionId}`,
          );
          // TODO: checks if there is updated tariff information available and set it in the PersonalMessage field.
        }
      }

      if (
        message.payload.eventType === TransactionEventEnumType.Ended &&
        transaction
      ) {
        response.totalCost = await this._calculateTotalCost(
          stationId,
          transaction.id,
          transaction.totalKwh,
        );
      }

      if (transactionEvent.meterValue) {
        const meterValuesValid =
          await this._signedMeterValuesUtil.validateMeterValues(
            stationId,
            transactionEvent.meterValue,
          );

        if (!meterValuesValid) {
          this._logger.warn(
            'One or more MeterValues in this TransactionEvent have an invalid signature.',
          );
        }
      }

      this.sendCallResultWithMessage(message, response).then(
        (messageConfirmation) => {
          this._logger.debug(
            'Transaction response sent: ',
            messageConfirmation,
          );
        },
      );
    }
  }

  @AsHandler(CallAction.MeterValues)
  protected async _handleMeterValues(
    message: IMessage<MeterValuesRequest>,
    props?: HandlerProperties,
  ): Promise<void> {
    this._logger.debug('MeterValues received:', message, props);

    // TODO: Meter values can be triggered. Ideally, it should be sent to the callbackUrl from the message api that sent the trigger message
    // TODO: If sendCostUpdatedOnMeterValue is true, meterValues handler triggers cost update
    //  when it is added into a transaction

    const meterValues = message.payload.meterValue;
    const stationId = message.context.stationId;

    await Promise.all(
      meterValues.map((meterValue) =>
        this.transactionEventRepository.createMeterValue(meterValue),
      ),
    );

    const meterValuesValid =
      await this._signedMeterValuesUtil.validateMeterValues(
        stationId,
        meterValues,
      );

    if (!meterValuesValid) {
      throw new OcppError(
        message.context.correlationId,
        ErrorCode.SecurityError,
        'One or more MeterValues have an invalid signature.',
      );
    }

    const response: MeterValuesResponse = {
      // TODO determine how to set chargingPriority and updatedPersonalMessage for anonymous users
    };

    this.sendCallResultWithMessage(message, response).then(
      (messageConfirmation) => {
        this._logger.debug('MeterValues response sent: ', messageConfirmation);
      },
    );
  }

  @AsHandler(CallAction.StatusNotification)
  protected async _handleStatusNotification(
    message: IMessage<StatusNotificationRequest>,
    props?: HandlerProperties,
  ): Promise<void> {
    this._logger.debug('StatusNotification received:', message, props);

    await this._statusNotificationService.processStatusNotification(
      message.context.stationId,
      message.payload,
    );

    // Create response
    const response: StatusNotificationResponse = {};
    this.sendCallResultWithMessage(message, response).then(
      (messageConfirmation) => {
        this._logger.debug(
          'StatusNotification response sent: ',
          messageConfirmation,
        );
      },
    );
  }

  /**
   * Handle responses
   */

  @AsHandler(CallAction.CostUpdated)
  protected _handleCostUpdated(
    message: IMessage<CostUpdatedResponse>,
    props?: HandlerProperties,
  ): void {
    this._logger.debug('CostUpdated response received:', message, props);
  }

  @AsHandler(CallAction.GetTransactionStatus)
  protected _handleGetTransactionStatus(
    message: IMessage<GetTransactionStatusResponse>,
    props?: HandlerProperties,
  ): void {
    this._logger.debug(
      'GetTransactionStatus response received:',
      message,
      props,
    );
  }

  /**
   * Round floor the given cost to 2 decimal places, e.g., given 1.2378, return 1.23
   *
   * @param {number} cost - cost
   * @return {number} rounded cost
   */
  private _roundCost(cost: number): number {
    return Math.floor(cost * 100) / 100;
  }

  private async _calculateTotalCost(
    stationId: string,
    transactionDbId: number,
    totalKwh?: number | null,
  ): Promise<number> {
    // TODO: This is a temp workaround. We need to refactor the calculation of totalCost when tariff
    //  implementation is finalized
    let totalCost = 0;

    const tariff: Tariff | undefined =
      await this._tariffRepository.findByStationId(stationId);
    if (tariff) {
      this._logger.debug(`Tariff ${tariff.id} found for station ${stationId}`);
      if (!totalKwh) {
        totalKwh = MeterValueUtils.getTotalKwh(
          await this._transactionEventRepository.readAllMeterValuesByTransactionDataBaseId(
            transactionDbId,
          ),
        );

        await Transaction.update(
          { totalKwh: totalKwh },
          { where: { id: transactionDbId }, returning: false },
        );
      }

      this._logger.debug(`TotalKwh: ${totalKwh}`);
      totalCost = this._roundCost(totalKwh * tariff.pricePerKwh);
    } else {
      this._logger.error(`Tariff not found for station ${stationId}`);
    }

    return totalCost;
  }

  /**
   * Internal method to execute a costUpdated request for an ongoing transaction repeatedly based on the costUpdatedInterval
   *
   * @param {string} stationId - The identifier of the client connection.
   * @param {string} transactionId - The identifier of the transaction.
   * @param {number} costUpdatedInterval - The costUpdated interval in milliseconds.
   * @param {string} tenantId - The identifier of the tenant.
   * @return {void} This function does not return anything.
   */
  private _updateCost(
    stationId: string,
    transactionId: string,
    costUpdatedInterval: number,
    tenantId: string,
  ): void {
    // TODO add canceling interval when transaction is over
    setInterval(async () => {
      const transaction: Transaction | undefined =
        await this._transactionEventRepository.readTransactionByStationIdAndTransactionId(
          stationId,
          transactionId,
        );
      if (transaction && transaction.isActive) {
        const cost = await this._calculateTotalCost(stationId, transaction.id);
        this.sendCall(stationId, tenantId, CallAction.CostUpdated, {
          totalCost: cost,
          transactionId: transaction.transactionId,
        } as CostUpdatedRequest).then(() => {
          this._logger.info(
            `Sent costUpdated for ${transaction.transactionId} with totalCost ${cost}`,
          );
        });
      }
    }, costUpdatedInterval * 1000);
  }
}
