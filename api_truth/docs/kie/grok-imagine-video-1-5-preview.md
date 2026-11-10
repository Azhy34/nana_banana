# Grok Imagine Video 1.5 Preview

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
      summary: Grok Imagine Video 1.5 Preview
      deprecated: false
      description: >-
        Output is an MP4 video with an audio track generated together with the
        video (dialogue written in the prompt is spoken). Audio cannot be turned
        off.


        ## Create Task


        Use this endpoint to create a new text-to-video generation task.


        <Card title="Get Task Details" icon="lucide-search"
        href="/market/common/get-task-detail">
          After submission, use the unified query endpoint to check task progress and retrieve results
        </Card>


        ::: tip[]

        For production use, we recommend providing the `callBackUrl` parameter
        so your service can receive completion notifications instead of polling
        for task status.

        :::


        ## File Upload


        ::: tip[]

        Need to upload files before calling this endpoint? See [File Upload API
        Quickstart](/file-upload-api/quickstart).

        :::


        ## Related Resources


        <CardGroup cols={2}>
          <Card title="Model Marketplace" icon="lucide-store" href="/market/quickstart">
            Explore all available models and capabilities
          </Card>
          <Card title="Common API" icon="lucide-cog" href="/common-api/get-account-credits">
            Check account credits and usage
          </Card>
        </CardGroup>
      operationId: GrokImagineVideo15PreviewCreateTask
      tags:
        - docs/en/Market/Video Models/Grok Imagine
        - generated/grok-imagine-video-1.5-preview
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                model:
                  type: string
                  description: >-
                    The model name used for generation. This endpoint must use
                    `grok-imagine-video-1-5-preview`.
                  enum:
                    - grok-imagine-video-1-5-preview
                  default: grok-imagine-video-1-5-preview
                  x-apidog-enum:
                    - value: grok-imagine-video-1-5-preview
                      name: ''
                      description: ''
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    Optional callback URL for task completion notifications. If
                    provided, the system will send a POST request to this URL
                    when the task completes.
                input:
                  type: object
                  description: Input parameters for the generation task.
                  additionalProperties: false
                  properties:
                    prompt:
                      type: string
                      description: >-
                        Prompt for video generation. Maximum length: 4096
                        characters.  Use `@imageN` in the prompt to reference an
                        image from `image_urls`, where N is the 1-based index of
                        the image. For example, `@image1` refers to the first
                        image in the array.
                      maxLength: 4096
                    image_urls:
                      description: >-
                        Upload image files to be used as API input. Supported
                        file types: image/jpeg, image/png, image/webp,
                        image/jpg. Maximum file size: 20MB. Supports multi-file
                        upload, up to 1 file.Only one is supported when the
                        resolution is 1080p.
                      type: array
                      items:
                        type: string
                        format: uri
                      maxItems: 1
                    aspect_ratio:
                      type: string
                      description: Aspect ratio for video generation.
                      enum:
                        - '1:1'
                        - '16:9'
                        - '9:16'
                        - '4:3'
                        - '3:4'
                        - '3:2'
                        - '2:3'
                        - auto
                      x-apidog-enum:
                        - value: '1:1'
                          name: ''
                          description: ''
                        - value: '16:9'
                          name: ''
                          description: ''
                        - value: '9:16'
                          name: ''
                          description: ''
                        - value: '4:3'
                          name: ''
                          description: ''
                        - value: '3:4'
                          name: ''
                          description: ''
                        - value: '3:2'
                          name: ''
                          description: ''
                        - value: '2:3'
                          name: ''
                          description: ''
                        - value: auto
                          name: ''
                          description: ''
                      default: auto
                      examples:
                        - auto
                    resolution:
                      description: Resolution for video generation.
                      type: string
                      enum:
                        - 480p
                        - 720p
                        - 1080p
                      default: 480p
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
                    duration:
                      description: >-
                        Video duration in seconds. Range: [1, 15]. Default: 8.
                        Minimum: 1. Maximum: 15. Step: 1.
                      type: integer
                      minimum: 1
                      maximum: 15
                      multipleOf: 1
                      default: 8
                    first_frame_url:
                      type: string
                      description: >-
                        First-frame image. Can be passed together with
                        image_urls, or sent on its own.
                    last_frame_url:
                      type: string
                      description: Last-frame image.
                    loop_url:
                      type: string
                      description: >-
                        Loop image used as both the start and end of the video.
                        Cannot be sent together with a different first-frame or
                        last-frame image.
                    keyframes:
                      type: array
                      items:
                        type: object
                        properties:
                          url:
                            type: string
                            description: image url.
                          timestamp_s:
                            type: integer
                            description: time stamp.
                        x-apidog-orders:
                          - url
                          - timestamp_s
                        required:
                          - url
                          - timestamp_s
                        x-apidog-ignore-properties: []
                      description: >-
                        Mid-video keyframes, up to 4. Each item must include url
                        and timestamp_s (in seconds). Each timestamp must be
                        greater than 0 and less than duration, and any two
                        keyframes must be at least 1/3 second apart.
                      maxItems: 4
                    enable_audio:
                      type: boolean
                      description: Whether to generate audio. Defaults to true.
                    nsfw_checker:
                      type: boolean
                      description: >-
                        Defaults to false. You can set it to false based on your
                        needs. If set to false, our content filtering will be
                        disabled, and all results will be returned directly by
                        the model itself.
                  required:
                    - image_urls
                  x-apidog-orders:
                    - prompt
                    - image_urls
                    - aspect_ratio
                    - resolution
                    - duration
                    - first_frame_url
                    - last_frame_url
                    - loop_url
                    - keyframes
                    - enable_audio
                    - nsfw_checker
                  x-apidog-ignore-properties: []
              x-apidog-refs: {}
              x-apidog-orders:
                - model
                - callBackUrl
                - input
              required:
                - model
                - input
              x-apidog-ignore-properties: []
            examples:
              default:
                value:
                  model: grok-imagine-video-1-5-preview
                  input:
                    prompt: Describe the scene you want to generate.
                    image_urls:
                      - https://your-domain.com/image/example.png
                    aspect_ratio: '16:9'
                    resolution: 480p
                    duration: 8
                  callBackUrl: https://your-domain.com/api/callback
                summary: Example request
      responses:
        '200':
          description: Request successful.
          content:
            application/json:
              schema:
                type: object
                x-apidog-refs:
                  01KT1GWQMF70CBVDJKT33BKBCV:
                    $ref: '#/components/schemas/ApiResponseWithRecordId'
                x-apidog-orders:
                  - 01KT1GWQMF70CBVDJKT33BKBCV
                properties:
                  code:
                    type: integer
                    enum:
                      - 200
                      - 401
                      - 402
                      - 404
                      - 422
                      - 429
                      - 455
                      - 500
                      - 501
                      - 505
                    description: >-
                      Status code of the request. The HTTP status is 200 even
                      when the request fails, so always check this field: 200
                      means success; any other value means the request failed
                      and msg describes the reason. Common values: 401 invalid
                      or missing API key; 402 insufficient credits; 429 rate
                      limit exceeded; 422 or 500 the request could not be
                      processed (read msg and check your parameters before
                      retrying).
                  msg:
                    type: string
                    description: Response message, error description when failed
                    examples:
                      - success
                  data:
                    type: object
                    properties:
                      taskId:
                        type: string
                        description: >-
                          Task ID, can be used with Get Task Details endpoint to
                          query task status
                      recordId:
                        type: string
                        description: Record ID, can be used to get the record details
                    x-apidog-orders:
                      - taskId
                      - recordId
                    x-apidog-ignore-properties: []
                required:
                  - data
                x-apidog-ignore-properties:
                  - code
                  - msg
                  - data
              examples:
                success:
                  summary: Success response
                  value:
                    code: 200
                    msg: success
                    data:
                      taskId: task_grok-imagine-video-1.5-preview_1234567890
          headers: {}
          x-apidog-name: ''
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: LhzUfVZBdr29eQi8xZ2jz
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: LhzUfVZBdr29eQi8xZ2jz
            scopes:
              LhzUfVZBdr29eQi8xZ2jz:
                undefined: []
      callbacks:
        videoTaskCompleted:
          '{request.body#/callBackUrl}':
            post:
              description: >-
                The system sends this callback when the
                `grok-imagine-video-1-5-preview` task succeeds or fails.
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
                                - grok-imagine-video-1-5-preview
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
                            model: grok-imagine-video-1-5-preview
                            state: success
                            param: >-
                              {"input":"{}","callBackUrl":"https://example.com/callback","model":"grok-imagine-video-1-5-preview"}
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
                            model: grok-imagine-video-1-5-preview
                            state: fail
                            param: >-
                              {"input":"{}","callBackUrl":"https://example.com/callback","model":"grok-imagine-video-1-5-preview"}
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
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-36941122-run
components:
  schemas:
    ApiResponseWithRecordId:
      type: object
      properties:
        code:
          type: integer
          enum:
            - 200
            - 401
            - 402
            - 404
            - 422
            - 429
            - 455
            - 500
            - 501
            - 505
          description: >-
            Status code of the request. The HTTP status is 200 even when the
            request fails, so always check this field: 200 means success; any
            other value means the request failed and msg describes the reason.
            Common values: 401 invalid or missing API key; 402 insufficient
            credits; 429 rate limit exceeded; 422 or 500 the request could not
            be processed (read msg and check your parameters before retrying).
        msg:
          type: string
          description: Response message, error description when failed
          examples:
            - success
        data:
          type: object
          properties:
            taskId:
              type: string
              description: >-
                Task ID, can be used with Get Task Details endpoint to query
                task status
            recordId:
              type: string
              description: Record ID, can be used to get the record details
          x-apidog-orders:
            - taskId
            - recordId
          x-apidog-ignore-properties: []
      x-apidog-orders:
        - code
        - msg
        - data
      title: response with recordId
      required:
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
