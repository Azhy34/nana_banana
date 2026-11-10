# Grok Imagine Image to Video

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: Grok Imagine Image to Video
      deprecated: false
      description: >
        Output is an MP4 video with an audio track generated together with the
        video (dialogue written in the prompt is spoken). Audio cannot be turned
        off.


        ## Query Task Status


        After submitting a task, use the unified query endpoint to check
        progress and retrieve results:


        <Card title="Get Task Details" icon="lucide-search"
        href="/market/common/get-task-detail">
          Learn how to query task status and retrieve generation results
        </Card>


        ::: tip[]

        For production use, we recommend using the `callBackUrl` parameter to
        receive automatic notifications when generation completes, rather than
        polling the status endpoint.

        :::


        ## Related Resources


        <CardGroup cols={2}>
          <Card title="Market Overview" icon="lucide-store" href="/market/quickstart">
            Explore all available models
          </Card>
          <Card title="Common API" icon="lucide-cog" href="/common-api/get-account-credits">
            Check credits and account usage
          </Card>
        </CardGroup>
      operationId: grok-imagine-image-to-video
      tags:
        - docs/en/Market/Video Models/Grok Imagine
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                model:
                  type: string
                  enum:
                    - grok-imagine/image-to-video
                  default: grok-imagine/image-to-video
                  description: |-
                    The model name to use for generation. Required field.

                    - Must be `grok-imagine/image-to-video` for this endpoint
                  examples:
                    - grok-imagine/image-to-video
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive video generation task completion updates.
                    Optional but recommended for production use.


                    - System will POST task status and results to this URL when
                    video generation completes

                    - Callback includes generated video URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing video results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameters for the video generation task
                  properties:
                    image_urls:
                      type: array
                      items:
                        type: string
                        format: uri
                      description: >-
                        Provide an external image URL as a reference for video
                        generation. Up to 7 images are supported. Do not use it
                        simultaneously with task_id. In your prompt, reference
                        an uploaded image by typing @image(n) followed by a
                        space (for example: @image1 a sunset over the ocean).

                        - Supports JPEG, PNG, and WEBP formats

                        - Maximum file size for each image: 10MB

                        - The Spicy mode is not available when using external
                        images

                        - The array can contain a maximum of seven URLs

                        - Only one is supported when the resolution is 1080p.
                      maxItems: 7
                      examples:
                        - - >-
                            https://file.aiquickdraw.com/custom-page/akr/section-images/1762247692373tw5di116.png
                    task_id:
                      type: string
                      description: >-
                        Task ID from a previously generated Grok image. Use with
                        index to select a specific image. Do not use with
                        image_urls.


                        - Use task ID from grok-imagine/text-to-image
                        generations

                        - Supports all modes including Spicy

                        - Maximum length: 100 characters
                      maxLength: 100
                      examples:
                        - task_grok_12345678
                    index:
                      type: integer
                      description: >-
                        When using task_id, the 0-based index of the image to
                        use. A grok-imagine/text-to-image task returns 2 images,
                        so valid values are 0 and 1. Default 0.


                        - Ignored if image_urls is provided
                      minimum: 0
                      maximum: 1
                      default: 0
                      examples:
                        - 0
                    prompt:
                      type: string
                      description: >-
                        Text prompt describing the desired video motion.
                        Optional field.


                        - Should be detailed and specific about the desired
                        visual motion

                        - Describe movement, action sequences, camera work, and
                        timing

                        - Include details about subjects, environments, and
                        motion dynamics

                        - Maximum length: 5000 characters

                        - Supports English language prompts
                      examples:
                        - >-
                          POV hand comes into frame handing the girl a cup of
                          take away coffee, the girl steps out of the screen
                          looking tired, then takes it and she says happily:
                          "thanks! Back to work" she exits the frame and walks
                          right to a different part of the office.
                    mode:
                      type: string
                      description: >-
                        Specifies the generation mode affecting the style and
                        intensity of motion. Note: Spicy mode is not available
                        for external image inputs.


                        - **fun**: More creative and playful interpretation

                        - **normal**: Balanced approach with good motion quality

                        - **spicy**: More dynamic and intense motion effects
                        (not available for external images)


                        Default: normal
                      enum:
                        - fun
                        - normal
                        - spicy
                      default: normal
                      examples:
                        - normal
                    duration:
                      type: string
                      description: >-
                        The duration of the generated video (in seconds) (6-30).
                        (Minimum: 6, Maximum: 30, Step: 1)
                    resolution:
                      type: string
                      description: The resolution of the generated video.
                      enum:
                        - 480p
                        - 720p
                        - 1080p
                      x-apidog-enum:
                        - value: 480p
                          name: ''
                          description: ''
                        - value: 720p
                          name: ''
                          description: ''
                        - value: 1080p
                          name: ''
                          description: ''
                      default: 480p
                      examples:
                        - 480p
                    aspect_ratio:
                      type: string
                      description: >-
                        Image ratio selection only applies to multi-image
                        generation mode. In single-image mode, the video width
                        and height are referenced to the image width and height.
                      enum:
                        - '2:3'
                        - '3:2'
                        - '1:1'
                        - '16:9'
                        - '9:16'
                      x-apidog-enum:
                        - value: '2:3'
                          name: ''
                          description: ''
                        - value: '3:2'
                          name: ''
                          description: ''
                        - value: '1:1'
                          name: ''
                          description: ''
                        - value: '16:9'
                          name: ''
                          description: ''
                        - value: '9:16'
                          name: ''
                          description: ''
                      default: '16:9'
                    nsfw_checker:
                      type: boolean
                      description: >-
                        Defaults to false. When false, no additional content
                        filtering is applied and results are returned directly
                        by the model.
                  x-apidog-orders:
                    - image_urls
                    - task_id
                    - index
                    - prompt
                    - mode
                    - duration
                    - resolution
                    - aspect_ratio
                    - 01KWKMG689R3ZTSNFWKDSMJN7E
                  x-apidog-refs:
                    01KWKMG689R3ZTSNFWKDSMJN7E:
                      $ref: '#/components/schemas/nsfw_checker'
                  x-apidog-ignore-properties:
                    - nsfw_checker
              required:
                - model
                - input
              x-apidog-orders:
                - model
                - callBackUrl
                - input
              examples:
                - model: grok-imagine/image-to-video
                  callBackUrl: https://your-domain.com/api/callback
                  input:
                    image_urls:
                      - >-
                        https://file.aiquickdraw.com/custom-page/akr/section-images/1762247692373tw5di116.png
                    prompt: >-
                      POV hand comes into frame handing the girl a cup of take
                      away coffee, the girl steps out of the screen looking
                      tired, then takes it and she says happily: "thanks! Back
                      to work" she exits the frame and walks right to a
                      different part of the office.
                    mode: normal
              x-apidog-ignore-properties: []
            example:
              model: grok-imagine/image-to-video
              callBackUrl: https://your-domain.com/api/callback
              input:
                image_urls:
                  - >-
                    https://file.aiquickdraw.com/custom-page/akr/section-images/1762247692373tw5di116.png
                prompt: >-
                  POV hand comes into frame handing the girl a cup of take away
                  coffee, the girl steps out of the screen looking tired, then
                  takes it and she says happily: "thanks! Back to work" she
                  exits the frame and walks right to a different part of the
                  office.
                mode: normal
                duration: '6'
                resolution: 480p
                aspect_ratio: '16:9'
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/response%20not%20with%20recordId'
              example:
                code: 200
                msg: success
                data:
                  taskId: 281e5b0*********************f39b9
          headers: {}
          x-apidog-name: ''
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
      callbacks:
        videoTaskCompleted:
          '{request.body#/callBackUrl}':
            post:
              description: >-
                The system sends this callback when the
                `grok-imagine/image-to-video` task succeeds or fails.
              requestBody:
                required: true
                content:
                  application/json:
                    schema:
                      type: object
                      required:
                        - code
                        - msg
                        - data
                      properties:
                        code:
                          type: integer
                          description: >-
                            Unified callback code: 200 for success, 501 for
                            failure.
                          enum:
                            - 200
                            - 501
                        msg:
                          type: string
                          description: Unified callback message.
                          enum:
                            - Playground task completed successfully.
                            - Playground task failed.
                        data:
                          type: object
                          required:
                            - taskId
                            - model
                            - state
                            - param
                          properties:
                            taskId:
                              type: string
                              description: The unique task identifier.
                            model:
                              type: string
                              description: The model used for the task.
                              enum:
                                - grok-imagine/image-to-video
                            state:
                              type: string
                              description: Terminal task state.
                              enum:
                                - success
                                - fail
                            param:
                              type: string
                              description: >-
                                JSON string containing the submitted task
                                parameters.
                            resultJson:
                              type: string
                              nullable: true
                              description: >-
                                JSON string containing resultUrls,
                                firstFrameUrl, lastFrameUrl, or resultObject
                                when successful. Present only when state is
                                success.
                            failCode:
                              type: string
                              nullable: true
                              description: >-
                                Failure code, a numeric string such as "400" or
                                "500". Present only when state is fail.
                            failMsg:
                              type: string
                              nullable: true
                              description: Failure reason. Present only when state is fail.
                            costTime:
                              type: integer
                              format: int64
                              description: >-
                                Processing time in seconds. Present on both
                                success and failure callbacks.
                            completeTime:
                              type: integer
                              format: int64
                              description: Task completion timestamp.
                            createTime:
                              type: integer
                              format: int64
                              description: Task creation timestamp.
                            updateTime:
                              type: integer
                              format: int64
                              description: >-
                                Use completeTime as the completion time;
                                updateTime may equal createTime.
                            creditsConsumed:
                              type: number
                              description: >-
                                Credits consumed by the task; 0 for failed
                                tasks.
                    examples:
                      success:
                        summary: Task completed successfully
                        value:
                          code: 200
                          msg: Playground task completed successfully.
                          data:
                            taskId: task_example_video_webhook_001
                            model: grok-imagine/image-to-video
                            state: success
                            param: >-
                              {"input":"{\"task_id\":\"task_grok_12345678\",\"image_urls\":[\"https://example.com/input-image.jpg\"],\"prompt\":\"POV
                              hand comes into frame handing the girl a cup of
                              take away coffee, the girl steps out of the screen
                              looking
                              tired,...\",\"mode\":\"normal\",\"duration\":\"6\",\"resolution\":\"480p\",\"aspect_ratio\":\"16:9\"}","callBackUrl":"https://example.com/callback","model":"grok-imagine/image-to-video"}
                            resultJson: >-
                              {"resultUrls":["https://example.com/generated-video.mp4"]}
                            costTime: 12
                            completeTime: 1234567890
                            createTime: 1234560000
                            updateTime: 1234567890
                            creditsConsumed: 1.23
                      failure:
                        summary: Task failed
                        value:
                          code: 501
                          msg: Playground task failed.
                          data:
                            taskId: task_example_video_webhook_001
                            model: grok-imagine/image-to-video
                            state: fail
                            param: >-
                              {"input":"{\"task_id\":\"task_grok_12345678\",\"image_urls\":[\"https://example.com/input-image.jpg\"],\"prompt\":\"POV
                              hand comes into frame handing the girl a cup of
                              take away coffee, the girl steps out of the screen
                              looking
                              tired,...\",\"mode\":\"normal\",\"duration\":\"6\",\"resolution\":\"480p\",\"aspect_ratio\":\"16:9\"}","callBackUrl":"https://example.com/callback","model":"grok-imagine/image-to-video"}
                            failCode: '400'
                            failMsg: <error detail>
                            costTime: 12
                            creditsConsumed: 0
              responses:
                '200':
                  description: Callback received successfully.
                  content:
                    application/json:
                      schema:
                        type: object
                        properties:
                          code:
                            type: integer
                            example: 200
                          msg:
                            type: string
                            example: success
                      example:
                        code: 200
                        msg: success
      x-apidog-folder: docs/en/Market/Video Models/Grok Imagine
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506396-run
components:
  schemas:
    nsfw_checker:
      type: object
      properties:
        nsfw_checker:
          type: boolean
          description: >-
            Defaults to false. When false, no additional content filtering is
            applied and results are returned directly by the model.
      x-apidog-orders:
        - nsfw_checker
      x-apidog-ignore-properties: []
      x-apidog-folder: ''
    response not with recordId:
      type: object
      required:
        - data
      properties:
        code:
          type: integer
          description: >-
            Status code of the request. The HTTP status is 200 even when the
            request fails, so always check this field: 200 means success; any
            other value means the request failed and msg describes the reason.
            Common values: 401 invalid or missing API key; 402 insufficient
            credits; 429 rate limit exceeded; 422 or 500 the request could not
            be processed (read msg and check your parameters before retrying).
          enum:
            - 200
            - 401
            - 402
            - 404
            - 422
            - 429
            - 433
            - 455
            - 500
            - 501
            - 505
        msg:
          type: string
          description: Response message, error description upon failure
          examples:
            - success
        data:
          type: object
          required:
            - taskId
          properties:
            taskId:
              type: string
              description: >-
                The task ID can be used with the "Get Task Details" endpoint to
                query the task status.
              examples:
                - dc1928bfcbc77cb6c85f3359a9c718b3
          x-apidog-orders:
            - taskId
          x-apidog-ignore-properties: []
      x-apidog-orders:
        - code
        - msg
        - data
      x-apidog-ignore-properties: []
      x-apidog-folder: ''
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
