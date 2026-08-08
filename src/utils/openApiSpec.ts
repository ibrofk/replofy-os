/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function generateOpenApiSpec(originUrl: string) {
  return {
    openapi: '3.0.0',
    info: {
      title: 'Replofy OS ChatGPT App API',
      description: 'API for managing tasks, bugs, cycle goals, and ingesting context sources in Replofy OS.',
      version: '1.0.0',
    },
    servers: [
      {
        url: originUrl,
        description: 'Dynamic host server derived from the user request',
      },
    ],
    paths: {
      '/api/v1/tasks': {
        get: {
          summary: 'List Tasks',
          description: 'Retrieve a list of active tasks within the current workspace.',
          operationId: 'listTasks',
          parameters: [
            {
              name: 'status',
              in: 'query',
              description: 'Filter tasks by status (todo, in-progress, done, icebox)',
              required: false,
              schema: {
                type: 'string',
                enum: ['todo', 'in-progress', 'done', 'icebox'],
              },
            },
          ],
          responses: {
            '200': {
              description: 'Successful retrieval of tasks',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: {
                          $ref: '#/components/schemas/Task',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: 'Create Task',
          description: 'Add a new task to the workspace.',
          operationId: 'createTask',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title'],
                  properties: {
                    title: {
                      type: 'string',
                      description: 'The title of the task.',
                    },
                    status: {
                      type: 'string',
                      enum: ['todo', 'in-progress', 'done', 'icebox'],
                      default: 'icebox',
                    },
                    effortPoints: {
                      type: 'integer',
                      enum: [1, 2, 3, 5, 8],
                      default: 1,
                    },
                    isLeadIndicator: {
                      type: 'boolean',
                      default: false,
                    },
                    cycleGoalId: {
                      type: 'string',
                      nullable: true,
                    },
                    assigneeId: {
                      type: 'string',
                      nullable: true,
                    },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Task created successfully',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Task',
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/tasks/{id}': {
        get: {
          summary: 'Get Task by ID',
          description: 'Retrieve a single task by its unique identifier.',
          operationId: 'getTask',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
              },
            },
          ],
          responses: {
            '200': {
              description: 'Successful retrieval of task',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        $ref: '#/components/schemas/Task',
                      },
                    },
                  },
                },
              },
            },
          },
        },
        patch: {
          summary: 'Update Task',
          description: 'Modify specific fields of an existing task.',
          operationId: 'updateTask',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
              },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: {
                      type: 'string',
                    },
                    status: {
                      type: 'string',
                      enum: ['todo', 'in-progress', 'done', 'icebox'],
                    },
                    effortPoints: {
                      type: 'integer',
                      enum: [1, 2, 3, 5, 8],
                    },
                    isLeadIndicator: {
                      type: 'boolean',
                    },
                    cycleGoalId: {
                      type: 'string',
                      nullable: true,
                    },
                    assigneeId: {
                      type: 'string',
                      nullable: true,
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Task updated successfully',
            },
          },
        },
        delete: {
          summary: 'Delete Task',
          description: 'Remove a task from the workspace.',
          operationId: 'deleteTask',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
              },
            },
          ],
          responses: {
            '200': {
              description: 'Task deleted successfully',
            },
          },
        },
      },
      '/api/v1/bugs': {
        get: {
          summary: 'List Bugs',
          description: 'Retrieve all active bugs within the current workspace.',
          operationId: 'listBugs',
          parameters: [
            {
              name: 'status',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
                enum: ['open', 'triaged', 'in-progress', 'blocked', 'resolved', 'closed'],
              },
            },
          ],
          responses: {
            '200': {
              description: 'Successful retrieval of bugs',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: {
                          $ref: '#/components/schemas/Bug',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: 'Create Bug',
          description: 'File a new bug in the system.',
          operationId: 'createBug',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title'],
                  properties: {
                    title: {
                      type: 'string',
                      description: 'The short summary of the bug.',
                    },
                    description: {
                      type: 'string',
                      description: 'Detailed reproduction steps and impact notes.',
                      default: '',
                    },
                    severity: {
                      type: 'string',
                      enum: ['low', 'medium', 'high', 'critical'],
                      default: 'medium',
                    },
                    status: {
                      type: 'string',
                      enum: ['open', 'triaged', 'in-progress', 'blocked', 'resolved', 'closed'],
                      default: 'open',
                    },
                    resolutionNotes: {
                      type: 'string',
                      default: '',
                    },
                    linkedTaskIds: {
                      type: 'array',
                      items: {
                        type: 'string',
                      },
                      default: [],
                    },
                    codeLinks: {
                      type: 'array',
                      description: 'Plain repository or directory/file links. No repository authentication is required.',
                      items: {
                        $ref: '#/components/schemas/BugCodeLink',
                      },
                      default: [],
                    },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Bug created successfully',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Bug',
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/bugs/{id}': {
        get: {
          summary: 'Get Bug by ID',
          description: 'Retrieve a single bug by its unique identifier.',
          operationId: 'getBug',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
              },
            },
          ],
          responses: {
            '200': {
              description: 'Successful retrieval of bug',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        $ref: '#/components/schemas/Bug',
                      },
                    },
                  },
                },
              },
            },
          },
        },
        patch: {
          summary: 'Update Bug',
          description: 'Modify specific fields of an existing bug record.',
          operationId: 'updateBug',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
              },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: {
                      type: 'string',
                    },
                    description: {
                      type: 'string',
                    },
                    severity: {
                      type: 'string',
                      enum: ['low', 'medium', 'high', 'critical'],
                    },
                    status: {
                      type: 'string',
                      enum: ['open', 'triaged', 'in-progress', 'blocked', 'resolved', 'closed'],
                    },
                    resolutionNotes: {
                      type: 'string',
                    },
                    linkedTaskIds: {
                      type: 'array',
                      items: {
                        type: 'string',
                      },
                    },
                    codeLinks: {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/BugCodeLink',
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Bug updated successfully',
            },
          },
        },
        delete: {
          summary: 'Delete Bug',
          description: 'Remove a bug record from the workspace.',
          operationId: 'deleteBug',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
              },
            },
          ],
          responses: {
            '200': {
              description: 'Bug deleted successfully',
            },
          },
        },
      },
      '/api/v1/cycle-goals': {
        get: {
          summary: 'List Cycle Goals',
          description: 'Retrieve all strategic cycle goals for the workspace.',
          operationId: 'listCycleGoals',
          responses: {
            '200': {
              description: 'Successful retrieval of goals',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: {
                          $ref: '#/components/schemas/CycleGoal',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: 'Create Cycle Goal',
          description: 'Establish a new strategic cycle goal.',
          operationId: 'createCycleGoal',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title'],
                  properties: {
                    title: {
                      type: 'string',
                    },
                    description: {
                      type: 'string',
                      default: '',
                    },
                    status: {
                      type: 'string',
                      enum: ['active', 'completed', 'archived'],
                      default: 'active',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Cycle goal created successfully',
            },
          },
        },
      },
      '/api/v1/accounts': {
        get: {
          summary: 'List Accounts',
          description: 'Retrieve Growth Pipeline accounts for the workspace.',
          operationId: 'listAccounts',
          parameters: [
            {
              name: 'status',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
                enum: ['prospect', 'customer', 'partner', 'inactive'],
              },
            },
          ],
          responses: {
            '200': {
              description: 'Successful retrieval of accounts',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: {
                          $ref: '#/components/schemas/Account',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: 'Create Account',
          description: 'Create a Growth Pipeline account.',
          operationId: 'createAccount',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/AccountInput',
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Account created successfully',
            },
          },
        },
      },
      '/api/v1/accounts/{id}': {
        get: {
          summary: 'Get Account by ID',
          operationId: 'getAccount',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Successful retrieval of account' } },
        },
        patch: {
          summary: 'Update Account',
          operationId: 'updateAccount',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AccountInput' } } },
          },
          responses: { '200': { description: 'Account updated successfully' } },
        },
        delete: {
          summary: 'Delete Account',
          operationId: 'deleteAccount',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Account deleted successfully' } },
        },
      },
      '/api/v1/leads': {
        get: {
          summary: 'List Leads',
          description: 'Retrieve Growth Pipeline leads for the workspace.',
          operationId: 'listLeads',
          parameters: [
            { name: 'stage', in: 'query', required: false, schema: { type: 'string', enum: ['new', 'qualified', 'contacted', 'demo-booked', 'proposal', 'won', 'lost'] } },
            { name: 'source', in: 'query', required: false, schema: { type: 'string', enum: ['inbound', 'referral', 'cold-outreach', 'waitlist', 'twitter', 'linkedin', 'email', 'other'] } },
            { name: 'priority', in: 'query', required: false, schema: { type: 'string', enum: ['low', 'medium', 'high'] } },
            { name: 'ownerId', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'accountId', in: 'query', required: false, schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Successful retrieval of leads',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'array',
                        items: {
                          $ref: '#/components/schemas/Lead',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: 'Create Lead',
          description: 'Create a Growth Pipeline lead.',
          operationId: 'createLead',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/LeadInput',
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Lead created successfully',
            },
          },
        },
      },
      '/api/v1/leads/{id}': {
        get: {
          summary: 'Get Lead by ID',
          operationId: 'getLead',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Successful retrieval of lead' } },
        },
        patch: {
          summary: 'Update Lead',
          operationId: 'updateLead',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LeadInput' } } },
          },
          responses: { '200': { description: 'Lead updated successfully' } },
        },
        delete: {
          summary: 'Delete Lead',
          operationId: 'deleteLead',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Lead deleted successfully' } },
        },
      },
      '/api/v1/blog-articles': {
        get: {
          summary: 'List Blogs Hub Articles',
          description: 'Retrieve structured Blogs Hub articles for roadmap and publishing work.',
          operationId: 'listBlogArticles',
          parameters: [
            { name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['idea', 'planned', 'researching', 'drafting', 'review', 'scheduled', 'published', 'archived', 'rejected'] } },
            { name: 'roadmapPhase', in: 'query', required: false, schema: { type: 'string', enum: ['now', 'next', 'later'] } },
            { name: 'priority', in: 'query', required: false, schema: { type: 'string', enum: ['low', 'medium', 'high'] } },
            { name: 'ownerId', in: 'query', required: false, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Successful retrieval of Blogs Hub articles' } },
        },
        post: {
          summary: 'Create Blogs Hub Article',
          description: 'Create a Blogs Hub article with roadmap, brief, evidence, source registry ids, and distribution metadata.',
          operationId: 'createBlogArticle',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/BlogArticleInput' },
                    { required: ['title'] },
                  ],
                },
              },
            },
          },
          responses: { '201': { description: 'Blogs Hub article created successfully' } },
        },
      },
      '/api/v1/blog-articles/{id}': {
        get: {
          summary: 'Get Blogs Hub Article by ID',
          operationId: 'getBlogArticle',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Successful retrieval of Blogs Hub article' } },
        },
        patch: {
          summary: 'Update Blogs Hub Article',
          operationId: 'updateBlogArticle',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/BlogArticleInput' } } },
          },
          responses: { '200': { description: 'Blogs Hub article updated successfully' } },
        },
        delete: {
          summary: 'Delete Blogs Hub Article',
          operationId: 'deleteBlogArticle',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Blogs Hub article deleted successfully' } },
        },
      },
      '/api/v1/creative-items': {
        get: {
          summary: 'List Creative Hub Items',
          description: 'Retrieve Creative Hub ideas, briefs, drafts, reviews, scheduled items, and published items.',
          operationId: 'listCreativeItems',
          parameters: [
            { name: 'platform', in: 'query', required: false, schema: { type: 'string', enum: ['Instagram', 'LinkedIn', 'X', 'TikTok', 'YouTube', 'Blog', 'Email', 'Other'] } },
            { name: 'format', in: 'query', required: false, schema: { type: 'string', enum: ['single-post', 'carousel', 'reel', 'story-sequence', 'motion-brief', 'static-ad', 'thread', 'other'] } },
            { name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['idea', 'brief', 'draft', 'in-review', 'changes-requested', 'approved', 'scheduled', 'published', 'rejected', 'archived'] } },
            { name: 'ownerId', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'campaign', in: 'query', required: false, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Successful retrieval of Creative Hub items' } },
        },
        post: {
          summary: 'Create Creative Hub Item',
          description: 'Create a Creative Hub idea or brief.',
          operationId: 'createCreativeItem',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreativeItemInput' } } },
          },
          responses: { '201': { description: 'Creative Hub item created successfully' } },
        },
      },
      '/api/v1/creative-items/{id}': {
        get: {
          summary: 'Get Creative Hub Item by ID',
          operationId: 'getCreativeItem',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Successful retrieval of Creative Hub item' } },
        },
        patch: {
          summary: 'Update Creative Hub Item',
          operationId: 'updateCreativeItem',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreativeItemInput' } } },
          },
          responses: { '200': { description: 'Creative Hub item updated successfully' } },
        },
        delete: {
          summary: 'Delete Creative Hub Item',
          operationId: 'deleteCreativeItem',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Creative Hub item deleted successfully' } },
        },
      },
      '/api/v1/creative-assets': {
        get: {
          summary: 'List Creative Hub Assets',
          description: 'Retrieve read-only Creative Hub asset metadata.',
          operationId: 'listCreativeAssets',
          parameters: [
            { name: 'creativeId', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'assetType', in: 'query', required: false, schema: { type: 'string', enum: ['image', 'video', 'document', 'source', 'other'] } },
            { name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['uploading', 'active', 'archived', 'error'] } },
          ],
          responses: { '200': { description: 'Successful retrieval of Creative Hub asset metadata' } },
        },
      },
      '/api/v1/creative-assets/{id}': {
        get: {
          summary: 'Get Creative Hub Asset Metadata by ID',
          operationId: 'getCreativeAsset',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Successful retrieval of Creative Hub asset metadata' } },
        },
      },
      '/api/v1/creative-assets/{id}/download': {
        get: {
          summary: 'Download Creative Hub Asset',
          description: 'Create a signed download URL for an active Creative Hub asset accessible to the authenticated workspace.',
          operationId: 'downloadCreativeAsset',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Signed Creative Hub asset download URL created successfully' },
            '404': { description: 'Creative Hub asset not found or not accessible' },
            '409': { description: 'Creative Hub asset is not active' },
          },
        },
      },
      '/api/v1/team-chat-channels': {
        get: {
          summary: 'List Team Chat Channels',
          operationId: 'listTeamChatChannels',
          parameters: [
            { name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['active', 'archived'] } },
            { name: 'limit', in: 'query', required: false, schema: { type: 'integer', maximum: 500 } },
          ],
          responses: { '200': { description: 'Successful retrieval of Team Chat channels' } },
        },
        post: {
          summary: 'Create Team Chat Channel',
          operationId: 'createTeamChatChannel',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TeamChatChannelInput' } } },
          },
          responses: { '201': { description: 'Team Chat channel created successfully' } },
        },
      },
      '/api/v1/team-chat-participants': {
        get: {
          summary: 'List Team Chat Identities',
          operationId: 'listTeamChatParticipants',
          parameters: [
            { name: 'participantType', in: 'query', required: false, schema: { type: 'string', enum: ['team-member', 'ai-agent'] } },
            { name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['active', 'inactive'] } },
            { name: 'linkedUserId', in: 'query', required: false, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Successful retrieval of Team Chat identities' } },
        },
        post: {
          summary: 'Register Team Chat Identity',
          operationId: 'registerTeamChatParticipant',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TeamChatParticipantInput' } } },
          },
          responses: { '201': { description: 'Team Chat identity registered successfully' } },
        },
      },
      '/api/v1/team-chat-messages': {
        post: {
          summary: 'Post Team Chat Message',
          description: 'Post an immutable message as an identity already assigned to the channel.',
          operationId: 'postTeamChatMessage',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/TeamChatMessageInput' } } },
          },
          responses: { '201': { description: 'Team Chat message posted successfully' } },
        },
      },
      '/api/v1/team-chat/messages': {
        get: {
          summary: 'Read Filtered Team Chat History',
          description: 'Read bounded Team Chat history with identity, sender type, ISO-8601 time range, text search, and cursor pagination filters.',
          operationId: 'listTeamChatMessages',
          parameters: [
            { name: 'channelId', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'participantId', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'participantType', in: 'query', required: false, schema: { type: 'string', enum: ['team-member', 'ai-agent'] } },
            { name: 'senderName', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'after', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
            { name: 'before', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
            { name: 'query', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'limit', in: 'query', required: false, schema: { type: 'integer', maximum: 200, default: 50 } },
          ],
          responses: { '200': { description: 'Successful retrieval of bounded Team Chat history' } },
        },
      },
      '/api/v1/team-chat/channels/{id}/participants': {
        post: {
          summary: 'Add Identity to Team Chat Channel',
          description: 'Atomically add a registered human or AI-agent identity to an active channel.',
          operationId: 'addTeamChatParticipantToChannel',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['participantId'],
                  properties: { participantId: { type: 'string' } },
                },
              },
            },
          },
          responses: { '200': { description: 'Identity added to Team Chat channel successfully' } },
        },
      },
      '/api/v1/context-routing/{resource}/{id}': {
        get: {
          summary: 'Get Workspace Object With Related Context',
          description:
            'Fetch one authorized workspace object and a compact deterministic set of attached and suggested related objects.',
          operationId: 'getWorkspaceObjectContext',
          parameters: [
            {
              name: 'resource',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'debug',
              in: 'query',
              required: false,
              description: 'Admin-only score diagnostics. Access filters still apply.',
              schema: { type: 'boolean', default: false },
            },
          ],
          responses: {
            '200': {
              description: 'Authorized anchor object and compact related context',
            },
            '403': {
              description: 'Insufficient scope or debug access requires an admin actor',
            },
            '404': {
              description: 'Resource or object not found',
            },
          },
        },
      },
      '/api/v1/context-ingestions': {
        post: {
          summary: 'Ingest Context Document',
          description: 'Submit an operational context document (notes, transcripts, logs, plans) to automatically feed, structure, and link context items into Replofy OS using AI ingestion pipelines.',
          operationId: 'ingestContext',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['fileName', 'content', 'mimeType', 'fileSize'],
                  properties: {
                    fileName: {
                      type: 'string',
                      description: 'Name of the source document.',
                    },
                    content: {
                      type: 'string',
                      description: 'Raw textual content of the document.',
                    },
                    mimeType: {
                      type: 'string',
                      description: 'MIME type of the source file (e.g. text/plain, text/markdown).',
                    },
                    fileSize: {
                      type: 'integer',
                      description: 'Size of the file in bytes.',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Context ingested and entities linked successfully',
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'Programmatic API Key generated from Developer Settings inside Replofy OS.',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Programmatic API Key generated from Developer Settings inside Replofy OS.',
        },
      },
      schemas: {
        Task: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            title: {
              type: 'string',
            },
            status: {
              type: 'string',
              enum: ['todo', 'in-progress', 'done', 'icebox'],
            },
            effortPoints: {
              type: 'integer',
              enum: [1, 2, 3, 5, 8],
            },
            isLeadIndicator: {
              type: 'boolean',
            },
            cycleGoalId: {
              type: 'string',
              nullable: true,
            },
            assigneeId: {
              type: 'string',
              nullable: true,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            completedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
          },
        },
        BugCodeLink: {
          type: 'object',
          required: ['type', 'url'],
          properties: {
            type: {
              type: 'string',
              enum: ['repository', 'directory'],
              description: 'Whether the target is a whole repository or a narrower directory/file path.',
            },
            url: {
              type: 'string',
              description: 'Public URL, local file URL, or plain path pointing at the relevant code.',
            },
            label: {
              type: 'string',
            },
            notes: {
              type: 'string',
            },
          },
        },
        Bug: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            title: {
              type: 'string',
            },
            description: {
              type: 'string',
            },
            severity: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
            },
            status: {
              type: 'string',
              enum: ['open', 'triaged', 'in-progress', 'blocked', 'resolved', 'closed'],
            },
            resolutionNotes: {
              type: 'string',
            },
            linkedTaskIds: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            codeLinks: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/BugCodeLink',
              },
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        CycleGoal: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            title: {
              type: 'string',
            },
            description: {
              type: 'string',
            },
            status: {
              type: 'string',
              enum: ['active', 'completed', 'archived'],
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        AccountInput: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            website: { type: 'string' },
            industry: { type: 'string' },
            size: { type: 'string' },
            notes: { type: 'string' },
            status: {
              type: 'string',
              enum: ['prospect', 'customer', 'partner', 'inactive'],
              default: 'prospect',
            },
            linkedLeadIds: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
        Account: {
          allOf: [
            { $ref: '#/components/schemas/AccountInput' },
            {
              type: 'object',
              properties: {
                id: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
              },
            },
          ],
        },
        LeadInput: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            email: { type: 'string' },
            companyName: { type: 'string' },
            accountId: { type: 'string', nullable: true },
            source: {
              type: 'string',
              enum: ['inbound', 'referral', 'cold-outreach', 'waitlist', 'twitter', 'linkedin', 'email', 'other'],
              default: 'inbound',
            },
            stage: {
              type: 'string',
              enum: ['new', 'qualified', 'contacted', 'demo-booked', 'proposal', 'won', 'lost'],
              default: 'new',
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              default: 'medium',
            },
            ownerId: { type: 'string', nullable: true },
            nextAction: { type: 'string' },
            nextActionAt: { type: 'string', format: 'date-time', nullable: true },
            notes: { type: 'string' },
            linkedTaskIds: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
        Lead: {
          allOf: [
            { $ref: '#/components/schemas/LeadInput' },
            {
              type: 'object',
              properties: {
                id: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
              },
            },
          ],
        },
        BlogArticleInput: {
          type: 'object',
          properties: {
            title: { type: 'string', maxLength: 240 },
            slug: { type: 'string', maxLength: 280 },
            summary: { type: 'string', maxLength: 4000 },
            content: { type: 'string', maxLength: 40000 },
            status: {
              type: 'string',
              enum: ['idea', 'planned', 'researching', 'drafting', 'review', 'scheduled', 'published', 'archived', 'rejected'],
              default: 'idea',
            },
            roadmapPhase: { type: 'string', enum: ['now', 'next', 'later'], default: 'next' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
            ownerId: { type: 'string', nullable: true },
            targetPublishAt: { type: 'string', format: 'date-time', nullable: true },
            scheduledFor: { type: 'string', format: 'date-time', nullable: true },
            brief: {
              type: 'object',
              properties: {
                audience: { type: 'string' },
                painPoint: { type: 'string' },
                buyingTrigger: { type: 'string' },
                brokenBelief: { type: 'string' },
                replofyAngle: { type: 'string' },
                thesis: { type: 'string' },
                cta: { type: 'string' },
                contentCluster: { type: 'string' },
              },
            },
            evidence: {
              type: 'array',
              maxItems: 500,
              items: {
                type: 'object',
                required: ['claim'],
                properties: {
                  id: { type: 'string' },
                  claim: { type: 'string' },
                  value: { type: 'string' },
                  sourceId: { type: 'string' },
                  sourceUrl: { type: 'string' },
                  quote: { type: 'string' },
                  confidence: { type: 'string', enum: ['unverified', 'supported', 'verified'], default: 'unverified' },
                  usedInDraft: { type: 'boolean', default: false },
                },
              },
            },
            linkedSourceIds: { type: 'array', items: { type: 'string' } },
            distribution: {
              type: 'object',
              properties: {
                seoTitle: { type: 'string' },
                metaDescription: { type: 'string' },
                primaryKeyword: { type: 'string' },
                channels: { type: 'array', items: { type: 'string' } },
                publicationUrl: { type: 'string' },
              },
            },
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
        CreativeItemInput: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string' },
            platform: {
              type: 'string',
              enum: ['Instagram', 'LinkedIn', 'X', 'TikTok', 'YouTube', 'Blog', 'Email', 'Other'],
              default: 'Other',
            },
            format: {
              type: 'string',
              enum: ['single-post', 'carousel', 'reel', 'story-sequence', 'motion-brief', 'static-ad', 'thread', 'other'],
              default: 'other',
            },
            campaign: { type: 'string' },
            audience: { type: 'string' },
            objective: { type: 'string' },
            hook: { type: 'string' },
            brief: { type: 'string' },
            caption: { type: 'string' },
            visualDirection: { type: 'string' },
            productionNotes: { type: 'string' },
            cta: { type: 'string' },
            status: {
              type: 'string',
              enum: ['idea', 'brief', 'draft', 'in-review', 'changes-requested', 'approved', 'scheduled', 'published', 'rejected', 'archived'],
              default: 'idea',
            },
            ownerId: { type: 'string', nullable: true },
            approverId: { type: 'string', nullable: true },
            targetPublishAt: { type: 'string', format: 'date-time', nullable: true },
            scheduledFor: { type: 'string', format: 'date-time', nullable: true },
            publishedAt: { type: 'string', format: 'date-time', nullable: true },
            submittedAt: { type: 'string', format: 'date-time', nullable: true },
            approvalNotes: { type: 'string' },
            assetIds: {
              type: 'array',
              items: { type: 'string' },
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
        TeamChatChannelInput: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', maxLength: 120 },
            topic: { type: 'string', maxLength: 500 },
            status: { type: 'string', enum: ['active', 'archived'], default: 'active' },
            participantIds: { type: 'array', maxItems: 200, items: { type: 'string' } },
          },
        },
        TeamChatParticipantInput: {
          type: 'object',
          required: ['displayName'],
          properties: {
            displayName: { type: 'string', maxLength: 120 },
            participantType: { type: 'string', enum: ['team-member', 'ai-agent'], default: 'ai-agent' },
            linkedUserId: { type: 'string', nullable: true },
            description: { type: 'string', maxLength: 500 },
            status: { type: 'string', enum: ['active', 'inactive'], default: 'active' },
          },
        },
        TeamChatMessageInput: {
          type: 'object',
          required: ['channelId', 'participantId', 'content'],
          properties: {
            channelId: { type: 'string' },
            participantId: { type: 'string' },
            content: { type: 'string', maxLength: 8000 },
            replyToMessageId: { type: 'string', nullable: true },
          },
        },
      },
    },
    security: [
      {
        ApiKeyAuth: [],
      },
      {
        BearerAuth: [],
      },
    ],
  };
}
