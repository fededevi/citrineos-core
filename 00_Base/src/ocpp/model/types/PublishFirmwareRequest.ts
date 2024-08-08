// Copyright 2023 S44, LLC
// Copyright Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache 2.0

/* eslint-disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

import { OcppRequest } from '../../..';

export interface PublishFirmwareRequest extends OcppRequest {
  customData?: CustomDataType | null;
  /**
   * This contains a string containing a URI pointing to a
   * location from which to retrieve the firmware.
   *
   */
  location: string;
  /**
   * This specifies how many times Charging Station must try
   * to download the firmware before giving up. If this field is not
   * present, it is left to Charging Station to decide how many times it wants to retry.
   *
   */
  retries?: number | null;
  /**
   * The MD5 checksum over the entire firmware file as a hexadecimal string of length 32.
   *
   */
  checksum: string;
  /**
   * The Id of the request.
   *
   */
  requestId: number;
  /**
   * The interval in seconds
   * after which a retry may be
   * attempted. If this field is not
   * present, it is left to Charging
   * Station to decide how long to wait
   * between attempts.
   *
   */
  retryInterval?: number | null;
}
/**
 * This class does not get 'AdditionalProperties = false' in the schema generation, so it can be extended with arbitrary JSON properties to allow adding custom data.
 */
export interface CustomDataType {
  vendorId: string;
  [k: string]: unknown;
}
