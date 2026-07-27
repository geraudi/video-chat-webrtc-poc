import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';

export const Runtime = {
  NodeJS18: aws.lambda.Runtime.NodeJS18dX,
  NodeJS20: aws.lambda.Runtime.NodeJS20dX,
  NodeJS22: aws.lambda.Runtime.NodeJS22dX,
  NodeJS24: aws.lambda.Runtime.NodeJS24dX
} as const;

export type NodejsFunctionArgs = Omit<aws.lambda.FunctionArgs, 'role'> & {
  policy?: aws.iam.PolicyArgs;
};

export class NodejsFunction extends pulumi.ComponentResource {
  public readonly role: aws.iam.Role;
  public readonly handler: aws.lambda.Function;
  constructor(
    private readonly name: string,
    props: NodejsFunctionArgs,
    options?: pulumi.CustomResourceOptions
  ) {
    super('webrtc:aws:NodejsFunction', name, props, options);
    const role = (this.role = this.createRole(name));
    const handler = (this.handler = new aws.lambda.Function(
      `${name}_Function`,
      {
        architectures: props.architectures ?? ['arm64'],
        runtime: props.runtime ?? Runtime.NodeJS24,
        role: role.arn,
        ...props
      },
      { parent: this }
    ));

    this.addPolicy(
      `${name}__CloudWatchRolePolicy`,
      'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
    );

    if (props.policy) this.addPolicy(`${name}_RolePolicy`, props.policy);
  }

  grantInvoke(name: string, principal: string, arn?: pulumi.Input<string>) {
    return new aws.lambda.Permission(
      name,
      {
        action: 'lambda:InvokeFunction',
        function: this.handler.arn,
        principal,
        sourceArn: arn
      },
      { parent: this }
    );
  }

  addPolicy(
    name: string,
    policyArn: string | pulumi.Output<string>
  ): aws.iam.RolePolicyAttachment;
  addPolicy(
    name: string,
    policy: aws.iam.PolicyArgs
  ): aws.iam.RolePolicyAttachment;
  addPolicy(
    name: string,
    policyArgs: aws.iam.PolicyArgs | string | pulumi.Output<string>
  ): aws.iam.RolePolicyAttachment {
    const isArn =
      typeof policyArgs === 'string' || pulumi.Output.isInstance(policyArgs);
    const policy = isArn
      ? null
      : new aws.iam.Policy(name, policyArgs, { parent: this });
    return new aws.iam.RolePolicyAttachment(
      `${name}_Attachment`,
      {
        role: this.role,
        policyArn: isArn ? policyArgs : policy!.arn
      },
      { parent: this }
    );
  }

  private createRole(name: string) {
    return new aws.iam.Role(
      `${name}_ExecutionRole`,
      {
        assumeRolePolicy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Action: 'sts:AssumeRole',
              Effect: 'Allow',
              Principal: {
                Service: 'lambda.amazonaws.com'
              }
            }
          ]
        })
      },
      { parent: this }
    );
  }
}
