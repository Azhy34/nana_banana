# Get Remaining Credits

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/chat/credit:
    get:
      summary: Get Remaining Credits
      deprecated: false
      description: |-
        :::tip[]
          Get the current credit balance available in your account.
        :::

        ### Usage Guide

        * Use this interface to check your current credit balance
        * Monitor usage to ensure sufficient credits to continue using services
        * Plan credit replenishment based on usage patterns

        ### Developer Notes

        * All generation services require credit balance
        * Service access will be restricted when credits are exhausted
        * Credit consumption is based on specific services and usage volume
      operationId: get-account-credits
      tags:
        - docs/en/Common API
      parameters: []
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                properties:
                  code:
                    description: >-
                      Status code of the request. The HTTP status is 200 even
                      when the request fails, so always check this field: 200
                      means success; any other value means the request failed
                      and msg describes the reason. Common values: 401 invalid
                      or missing API key; 402 insufficient credits; 429 rate
                      limit exceeded; 422 or 500 the request could not be
                      processed (read msg and check your parameters before
                      retrying).
                    enum:
                      - 200
                      - 401
                      - 404
                      - 429
                      - 455
                      - 500
                    type: integer
                  msg:
                    description: Error message when code != 200
                    examples:
                      - success
                    type: string
                  data:
                    description: Remaining credits (may have decimals)
                    examples:
                      - 100.5
                    type: number
                required:
                  - code
                  - msg
                  - data
                type: object
                x-apidog-orders:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 200
                msg: success
                data: 100.5
          headers: {}
          x-apidog-name: ''
        '500':
          description: Server error.
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **408**: Timeout - No result has been returned for over
                      10 minutes.

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: Error
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      x-apidog-folder: docs/en/Common API
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506189-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: >-
        All API requests require a Bearer Token. Add the header `Authorization:
        Bearer YOUR_API_KEY` to authenticate requests.
    BearerAuth1:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: >-
        所有 API 请求都需要 Bearer Token。请在请求头中添加 `Authorization: Bearer YOUR_API_KEY`
        进行身份验证。
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```
